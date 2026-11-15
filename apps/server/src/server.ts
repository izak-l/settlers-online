import { createServer as createHttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server, type Socket } from "socket.io";
import type { GameEvent } from "@settlers/engine";
import {
  CreateLobbySchema,
  GameActionSchema,
  JoinGameSchema,
  LobbyRefSchema,
  SetReadySchema,
  SetUsernameSchema,
  TakeSeatSchema,
  type Ack,
  type ClientToServerEvents,
  type GameStateMessage,
  type LobbyState,
  type Me,
  type SeatPlayer,
  type ServerToClientEvents,
} from "@settlers/protocol";
import type { Authenticator } from "./auth";
import type { Config } from "./config";
import { fail } from "./errors";
import { LobbyService } from "./lobbies";
import { KeyedQueue } from "./queue";
import { RoomManager, type GameRoom, type Role } from "./rooms";
import type { LobbyRecord, Store } from "./store/types";

interface SocketData {
  userId: string;
  username: string | null;
  /** Games this socket has joined, and its role in each. */
  games: Map<string, Role>;
  lobbies: Set<string>;
}

type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type ServerSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

export interface RunningServer {
  url: string;
  io: IO;
  close(): Promise<void>;
}

export interface ServerOptions {
  config: Pick<Config, "WEB_ORIGIN" | "SNAPSHOT_EVERY">;
  store: Store;
  auth: Authenticator;
  /** 0 picks a free port (tests). */
  port: number;
}

/** Reply to an acknowledgement, turning thrown errors into SERVER_ERROR. */
async function respond<T>(reply: unknown, work: () => Promise<Ack<T>>): Promise<void> {
  let ack: Ack<T>;
  try {
    ack = await work();
  } catch (err) {
    console.error(err);
    ack = fail("SERVER_ERROR");
  }
  if (typeof reply === "function") (reply as (a: Ack<T>) => void)(ack);
}

export async function startServer({
  config,
  store,
  auth,
  port,
}: ServerOptions): Promise<RunningServer> {
  const http = createHttpServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
    } else {
      res.writeHead(404).end();
    }
  });
  const io: IO = new Server(http, { cors: { origin: config.WEB_ORIGIN } });

  const lobbyQueue = new KeyedQueue();
  const lobbies = new LobbyService(store, lobbyQueue);
  const rooms = new RoomManager(store, config.SNAPSHOT_EVERY);
  /** userId → number of open sockets. Seats stay reserved at 0; this only drives "connected". */
  const presence = new Map<string, number>();
  const isConnected = (userId: string) => (presence.get(userId) ?? 0) > 0;

  // ---- building and sending state ----

  async function lobbyState(lobby: LobbyRecord): Promise<LobbyState> {
    const ids = lobby.seats.flatMap((s) => (s ? [s.userId] : []));
    const names = new Map((await store.getProfiles(ids)).map((p) => [p.id, p.username ?? "?"]));
    return {
      id: lobby.id,
      hostId: lobby.hostId,
      maxSeats: lobby.maxSeats,
      allowSpectators: lobby.allowSpectators,
      seats: lobby.seats.map((s) =>
        s
          ? {
              userId: s.userId,
              username: names.get(s.userId) ?? "?",
              ready: s.ready,
              connected: isConnected(s.userId),
            }
          : null,
      ),
      status: lobby.status,
      gameId: lobby.gameId,
    };
  }

  async function broadcastLobby(lobbyId: string): Promise<void> {
    const lobby = await store.getLobby(lobbyId);
    if (lobby) io.to(`lobby:${lobbyId}`).emit("lobby", await lobbyState(lobby));
  }

  async function seatPlayers(room: GameRoom): Promise<SeatPlayer[]> {
    const profiles = await store.getProfiles(room.players.map((p) => p.userId));
    const names = new Map(profiles.map((p) => [p.id, p.username ?? "?"]));
    return room.players.map((p) => ({
      seat: p.seat,
      userId: p.userId,
      username: names.get(p.userId) ?? "?",
      connected: isConnected(p.userId),
    }));
  }

  /** Send every socket in the game its own view. Built once per role, not once per socket. */
  async function broadcastGame(room: GameRoom, events: GameEvent[]): Promise<void> {
    const players = await seatPlayers(room);
    const byRole = new Map<Role, GameStateMessage>();
    for (const s of await io.in(`game:${room.id}`).fetchSockets()) {
      const role = s.data.games.get(room.id);
      if (!role) continue;
      if (!byRole.has(role)) byRole.set(role, room.messageFor(role, events, players, false));
      s.emit("state", byRole.get(role)!);
    }
  }

  // ---- sign-in ----

  io.use(async (socket, next) => {
    try {
      const token: unknown = socket.handshake.auth?.["token"];
      const identity = typeof token === "string" ? await auth.verify(token) : null;
      if (!identity) return next(new Error("UNAUTHENTICATED"));
      let profile = await store.ensureProfile(identity.userId);
      if (!profile.username && identity.devUsername) {
        if ((await store.setUsername(identity.userId, identity.devUsername)) === "ok") {
          profile = { ...profile, username: identity.devUsername };
        }
      }
      socket.data = {
        userId: identity.userId,
        username: profile.username,
        games: new Map(),
        lobbies: new Set(),
      };
      next();
    } catch (err) {
      console.error(err);
      next(new Error("SERVER_ERROR"));
    }
  });

  io.on("connection", (socket: ServerSocket) => {
    const { userId } = socket.data;
    presence.set(userId, (presence.get(userId) ?? 0) + 1);
    void socket.join(`user:${userId}`);
    const me: Me = { id: userId, username: socket.data.username };
    socket.emit("welcome", me);

    const needUsername = () => (socket.data.username ? null : fail("NEED_USERNAME"));

    socket.on("profile:setUsername", (payload, reply) =>
      respond(reply, async () => {
        const p = SetUsernameSchema.safeParse(payload);
        if (!p.success) return fail("BAD_REQUEST", p.error.issues[0]?.message);
        if ((await store.setUsername(userId, p.data.username)) === "taken")
          return fail("USERNAME_TAKEN");
        socket.data.username = p.data.username;
        return { ok: true, me: { id: userId, username: p.data.username } };
      }),
    );

    socket.on("lobby:create", (payload, reply) =>
      respond(reply, async () => {
        const p = CreateLobbySchema.safeParse(payload);
        if (!p.success) return fail("BAD_REQUEST");
        const missing = needUsername();
        if (missing) return missing;
        const lobby = await lobbies.create(userId, p.data);
        void socket.join(`lobby:${lobby.id}`);
        socket.data.lobbies.add(lobby.id);
        return { ok: true, lobby: await lobbyState(lobby) };
      }),
    );

    socket.on("lobby:join", (payload, reply) =>
      respond(reply, async () => {
        const p = LobbyRefSchema.safeParse(payload);
        if (!p.success) return fail("BAD_REQUEST");
        const missing = needUsername();
        if (missing) return missing;
        const lobby = await lobbies.get(p.data.lobbyId);
        if (!lobby) return fail("NOT_FOUND");
        void socket.join(`lobby:${lobby.id}`);
        socket.data.lobbies.add(lobby.id);
        return { ok: true, lobby: await lobbyState(lobby) };
      }),
    );

    socket.on("lobby:seat", (payload, reply) =>
      respond(reply, async () => {
        const p = TakeSeatSchema.safeParse(payload);
        if (!p.success) return fail("BAD_REQUEST");
        const missing = needUsername();
        if (missing) return missing;
        const ack = await lobbies.takeSeat(p.data.lobbyId, userId, p.data.seat);
        if (ack.ok) await broadcastLobby(p.data.lobbyId);
        return ack;
      }),
    );

    socket.on("lobby:ready", (payload, reply) =>
      respond(reply, async () => {
        const p = SetReadySchema.safeParse(payload);
        if (!p.success) return fail("BAD_REQUEST");
        const ack = await lobbies.setReady(p.data.lobbyId, userId, p.data.ready);
        if (ack.ok) await broadcastLobby(p.data.lobbyId);
        return ack;
      }),
    );

    socket.on("lobby:start", (payload, reply) =>
      respond(reply, async () => {
        const p = LobbyRefSchema.safeParse(payload);
        if (!p.success) return fail("BAD_REQUEST");
        const ack = await lobbies.start(p.data.lobbyId, userId);
        if (ack.ok) await broadcastLobby(p.data.lobbyId);
        return ack;
      }),
    );

    socket.on("game:join", (payload, reply) =>
      respond(reply, async () => {
        const p = JoinGameSchema.safeParse(payload);
        if (!p.success) return fail("BAD_REQUEST");
        const room = await rooms.get(p.data.gameId);
        if (!room) return fail("NOT_FOUND");
        const role: Role = room.seatOf(userId) ?? "spectator";
        if (role === "spectator" && !room.allowSpectators) return fail("SPECTATORS_DISABLED");

        // Join inside the game's queue so no action lands between our snapshot and the join.
        await rooms.queue.run(`game:${room.id}`, async () => {
          socket.data.games.set(room.id, role);
          await socket.join(`game:${room.id}`);
          socket.emit("state", room.messageFor(role, [], await seatPlayers(room), true));
        });
        // Let everyone else see that this player is connected.
        if (role !== "spectator") await broadcastGame(room, []);
        return { ok: true, you: role };
      }),
    );

    socket.on("game:action", (payload, reply) =>
      respond(reply, async () => {
        const p = GameActionSchema.safeParse(payload);
        if (!p.success) return fail("BAD_REQUEST");
        const room = await rooms.get(p.data.gameId);
        if (!room) return fail("NOT_FOUND");
        const seat = room.seatOf(userId);
        if (!seat) return { ok: false, code: "NOT_YOUR_TURN", message: "Spectators can't act." };

        const result = await rooms.queue.run(`game:${room.id}`, async () => {
          const res = await room.submit(seat, p.data.action);
          if (res.ok) await broadcastGame(room, res.events);
          return res;
        });
        return result.ok ? { ok: true, seq: result.seq } : result;
      }),
    );

    socket.on("disconnect", () => {
      const left = (presence.get(userId) ?? 1) - 1;
      if (left > 0) {
        presence.set(userId, left);
        return;
      }
      presence.delete(userId);
      // Seats stay reserved; just tell everyone this player dropped.
      void (async () => {
        try {
          for (const id of socket.data.lobbies) await broadcastLobby(id);
          for (const id of socket.data.games.keys()) {
            const room = await rooms.get(id);
            if (room) await broadcastGame(room, []);
          }
        } catch (err) {
          console.error(err);
        }
      })();
    });
  });

  await new Promise<void>((resolve) => http.listen(port, resolve));
  const { port: actual } = http.address() as AddressInfo;

  return {
    url: `http://localhost:${actual}`,
    io,
    async close() {
      await io.close(); // also closes the HTTP server
    },
  };
}
