import { createServer as createHttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Server, type Socket } from "socket.io";
import type { GameEvent } from "@settlers/engine";
import {
  ChatSendSchema,
  CreateLobbySchema,
  FriendRequestSchema,
  FriendRespondSchema,
  GameActionSchema,
  GameRefSchema,
  InviteSchema,
  JoinGameSchema,
  LobbyRefSchema,
  SetLobbyMapSchema,
  SetReadySchema,
  SetUsernameSchema,
  TakeSeatSchema,
  UserRefSchema,
  type Ack,
  type ChatChannel,
  type ClientToServerEvents,
  type GameStateMessage,
  type LobbyState,
  type Me,
  type Presence,
  type SeatPlayer,
  type ServerToClientEvents,
} from "@settlers/protocol";
import type { Authenticator } from "./auth";
import type { Config } from "./config";
import { fail } from "./errors";
import { FriendService } from "./friends";
import { LobbyService } from "./lobbies";
import { PresenceTracker } from "./presence";
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
  /** Length of one timer "second" in ms; tests shrink it so timeouts happen fast. */
  secondMs?: number;
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
  secondMs = 1000,
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
  const rooms = new RoomManager(store, config.SNAPSHOT_EVERY, secondMs);
  /** gameId → the pending timeout for that game's running clock. */
  const timeouts = new Map<string, ReturnType<typeof setTimeout>>();
  let closing = false;
  /** userId → times of recent chat messages, for the rate limit. */
  const chatTimes = new Map<string, number[]>();
  const CHAT_LIMIT = { messages: 5, perMs: 10_000, history: 100 };
  const channelsFor = (role: Role): ChatChannel[] =>
    role === "spectator" ? ["players", "spectators"] : ["players"];
  const friends = new FriendService(store, new KeyedQueue());
  /** Who is online and where. Seats stay reserved while offline; this only drives "connected". */
  const presence = new PresenceTracker();
  const isConnected = (userId: string) => presence.isOnline(userId);
  /** Open invites per lobby (in memory only), so they can be withdrawn when it starts. */
  const invites = new Map<string, Set<string>>();
  /** Work started outside a request (disconnect broadcasts); `close` waits for it. */
  const background = new Set<Promise<void>>();
  const inBackground = (work: () => Promise<void>) => {
    const p = work().catch((err: unknown) => console.error(err));
    background.add(p);
    void p.finally(() => background.delete(p));
  };

  // ---- building and sending state ----

  async function lobbyState(lobby: LobbyRecord): Promise<LobbyState> {
    const ids = lobby.seats.flatMap((s) => (s ? [s.userId] : []));
    const names = new Map((await store.getProfiles(ids)).map((p) => [p.id, p.username ?? "?"]));
    return {
      id: lobby.id,
      hostId: lobby.hostId,
      maxSeats: lobby.maxSeats,
      allowSpectators: lobby.allowSpectators,
      turnSeconds: lobby.turnSeconds,
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
      map: {
        id: lobby.map.id,
        name: lobby.map.name ?? lobby.map.id,
        description: lobby.map.description ?? "",
        players: lobby.map.players,
        vpToWin: lobby.map.vpToWin,
        def: lobby.map,
      },
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

  /** (Re)arm the game's timeout for whichever clock is running now. */
  function armClock(room: GameRoom, anyoneHome: boolean): void {
    clearTimeout(timeouts.get(room.id));
    timeouts.delete(room.id);
    const running = room.updateClock(Date.now(), anyoneHome && !closing);
    if (!running) return;
    const armedAt = room.currentSeq;
    const fire = () =>
      inBackground(() =>
        rooms.queue.run(`game:${room.id}`, async () => {
          // Someone acted in the meantime: that action's broadcast re-armed the clock.
          if (room.currentSeq !== armedAt) return;
          const events = await room.timeout(running.key);
          if (events.length > 0) await broadcastGame(room, events);
        }),
      );
    timeouts.set(room.id, setTimeout(fire, Math.max(0, running.deadline - Date.now())));
  }

  /**
   * Send every socket in the game its own view. Built once per role, not once per socket.
   * Also re-arms the turn timer, since every change to a game passes through here.
   */
  async function broadcastGame(room: GameRoom, events: GameEvent[]): Promise<void> {
    const players = await seatPlayers(room);
    const byRole = new Map<Role, GameStateMessage>();
    const sockets = await io.in(`game:${room.id}`).fetchSockets();
    armClock(
      room,
      sockets.some((s) => {
        const role = s.data.games.get(room.id);
        return role !== undefined && role !== "spectator";
      }),
    );
    for (const s of sockets) {
      const role = s.data.games.get(room.id);
      if (!role) continue;
      if (!byRole.has(role)) byRole.set(role, room.messageFor(role, events, players, false));
      s.emit("state", byRole.get(role)!);
    }
  }

  // ---- friends and presence ----

  async function sendFriends(userId: string): Promise<void> {
    io.to(`user:${userId}`).emit(
      "friends",
      await friends.stateFor(userId, (id) => presence.status(id)),
    );
  }

  /**
   * Tell `userId`'s friends where they are now (no-op when nothing changed). Sends the status as
   * of sending, not `changed`: several of these can be in flight at once and finish out of order,
   * so the last message to arrive must still be the truth.
   */
  async function tellFriends(userId: string, changed: Presence | null): Promise<void> {
    if (!changed) return;
    const ids = await friends.friendIds(userId);
    const presenceNow = presence.status(userId);
    for (const id of ids) io.to(`user:${id}`).emit("presence", { userId, presence: presenceNow });
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
    const arrived = presence.connect(socket.id, userId);
    void socket.join(`user:${userId}`);
    const me: Me = { id: userId, username: socket.data.username };
    socket.emit("welcome", me);
    inBackground(async () => {
      socket.emit("friends", await friends.stateFor(userId, (id) => presence.status(id)));
      await tellFriends(userId, arrived);
    });

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
        await tellFriends(userId, presence.move(socket.id, { kind: "lobby", lobbyId: lobby.id }));
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
        if (lobby.status === "open")
          await tellFriends(userId, presence.move(socket.id, { kind: "lobby", lobbyId: lobby.id }));
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

    socket.on("lobby:map", (payload, reply) =>
      respond(reply, async () => {
        const p = SetLobbyMapSchema.safeParse(payload);
        if (!p.success) return fail("BAD_REQUEST");
        const ack = await lobbies.setMap(p.data.lobbyId, userId, p.data.map);
        if (ack.ok) await broadcastLobby(p.data.lobbyId);
        return ack;
      }),
    );

    socket.on("lobby:start", (payload, reply) =>
      respond(reply, async () => {
        const p = LobbyRefSchema.safeParse(payload);
        if (!p.success) return fail("BAD_REQUEST");
        const ack = await lobbies.start(p.data.lobbyId, userId);
        if (ack.ok) {
          await broadcastLobby(p.data.lobbyId);
          for (const id of invites.get(p.data.lobbyId) ?? [])
            io.to(`user:${id}`).emit("invite:closed", { lobbyId: p.data.lobbyId });
          invites.delete(p.data.lobbyId);
        }
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
        socket.emit("chat", {
          gameId: room.id,
          messages: await store.recentChat(room.id, channelsFor(role), CHAT_LIMIT.history),
          replace: true,
        });
        // Let everyone else see that this player is connected.
        if (role !== "spectator") await broadcastGame(room, []);
        await tellFriends(
          userId,
          presence.move(socket.id, {
            kind: "game",
            gameId: room.id,
            playing: role !== "spectator" && !room.finished,
          }),
        );
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

    socket.on("lobby:leave", (payload, reply) =>
      respond(reply, async () => {
        const p = LobbyRefSchema.safeParse(payload);
        if (!p.success) return fail("BAD_REQUEST");
        const { lobbyId } = p.data;
        // Synchronous before any await, so a rejoin sent right after can't be undone by this.
        socket.data.lobbies.delete(lobbyId);
        void socket.leave(`lobby:${lobbyId}`);
        await tellFriends(
          userId,
          presence.leave(socket.id, (pl) => pl.kind === "lobby" && pl.lobbyId === lobbyId),
        );
        return { ok: true };
      }),
    );

    socket.on("game:leave", (payload, reply) =>
      respond(reply, async () => {
        const p = GameRefSchema.safeParse(payload);
        if (!p.success) return fail("BAD_REQUEST");
        const { gameId } = p.data;
        // Synchronous before any await, so a rejoin sent right after can't be undone by this.
        const role = socket.data.games.get(gameId);
        socket.data.games.delete(gameId);
        void socket.leave(`game:${gameId}`);
        // A player leaving may leave nobody home, which stops the clock.
        const room = role && role !== "spectator" ? await rooms.get(gameId) : null;
        if (room) await broadcastGame(room, []);
        await tellFriends(
          userId,
          presence.leave(socket.id, (pl) => pl.kind === "game" && pl.gameId === gameId),
        );
        return { ok: true };
      }),
    );

    socket.on("friends:list", (_payload, reply) =>
      respond(reply, async () => ({
        ok: true,
        friends: await friends.stateFor(userId, (id) => presence.status(id)),
      })),
    );

    socket.on("friends:request", (payload, reply) =>
      respond(reply, async () => {
        const p = FriendRequestSchema.safeParse(payload);
        if (!p.success) return fail("BAD_REQUEST", p.error.issues[0]?.message);
        const ack = await friends.request(userId, p.data.username);
        if (!ack.ok) return ack;
        await sendFriends(userId);
        await sendFriends(ack.userId);
        return { ok: true };
      }),
    );

    socket.on("friends:respond", (payload, reply) =>
      respond(reply, async () => {
        const p = FriendRespondSchema.safeParse(payload);
        if (!p.success) return fail("BAD_REQUEST");
        const ack = await friends.respond(userId, p.data.userId, p.data.accept);
        if (ack.ok) {
          await sendFriends(userId);
          await sendFriends(p.data.userId);
        }
        return ack;
      }),
    );

    socket.on("friends:remove", (payload, reply) =>
      respond(reply, async () => {
        const p = UserRefSchema.safeParse(payload);
        if (!p.success) return fail("BAD_REQUEST");
        const ack = await friends.remove(userId, p.data.userId);
        if (ack.ok) {
          await sendFriends(userId);
          await sendFriends(p.data.userId);
        }
        return ack;
      }),
    );

    socket.on("chat:send", (payload, reply) =>
      respond(reply, async () => {
        const p = ChatSendSchema.safeParse(payload);
        if (!p.success) return fail("BAD_REQUEST", p.error.issues[0]?.message);
        const { gameId, text } = p.data;
        const role = socket.data.games.get(gameId);
        if (!role) return fail("NOT_FOUND");

        const now = Date.now();
        const recent = (chatTimes.get(userId) ?? []).filter((t) => now - t < CHAT_LIMIT.perMs);
        if (recent.length >= CHAT_LIMIT.messages) return fail("RATE_LIMITED");
        chatTimes.set(userId, [...recent, now]);

        const channel: ChatChannel = role === "spectator" ? "spectators" : "players";
        const msg = await store.addChat(gameId, channel, userId, text);
        for (const s of await io.in(`game:${gameId}`).fetchSockets()) {
          const theirs = s.data.games.get(gameId);
          if (theirs && channelsFor(theirs).includes(channel))
            s.emit("chat", { gameId, messages: [msg], replace: false });
        }
        return { ok: true };
      }),
    );

    socket.on("games:history", (_payload, reply) =>
      respond(reply, async () => ({ ok: true, games: await store.gamesForUser(userId, 20) })),
    );

    socket.on("lobby:invite", (payload, reply) =>
      respond(reply, async () => {
        const p = InviteSchema.safeParse(payload);
        if (!p.success) return fail("BAD_REQUEST");
        const { lobbyId, userId: friendId } = p.data;
        const lobby = await lobbies.get(lobbyId);
        if (!lobby || !socket.data.lobbies.has(lobbyId)) return fail("NOT_FOUND");
        if (lobby.status !== "open") return fail("LOBBY_STARTED");
        if (!(await friends.areFriends(userId, friendId))) return fail("NOT_FRIENDS");
        if (!presence.isOnline(friendId)) return fail("FRIEND_OFFLINE");
        const open = invites.get(lobbyId) ?? new Set<string>();
        open.add(friendId);
        invites.set(lobbyId, open);
        io.to(`user:${friendId}`).emit("invite", {
          lobbyId,
          from: { userId, username: socket.data.username ?? "?" },
        });
        return { ok: true };
      }),
    );

    socket.on("disconnect", () => {
      const status = presence.disconnect(socket.id);
      inBackground(() => tellFriends(userId, status));
      const stillOnline = presence.isOnline(userId);
      // Seats stay reserved; just tell everyone this player dropped (and re-check game clocks).
      inBackground(async () => {
        if (!stillOnline) for (const id of socket.data.lobbies) await broadcastLobby(id);
        for (const id of socket.data.games.keys()) {
          const room = await rooms.get(id);
          if (room) await broadcastGame(room, []);
        }
      });
    });
  });

  await new Promise<void>((resolve) => http.listen(port, resolve));
  const { port: actual } = http.address() as AddressInfo;

  return {
    url: `http://localhost:${actual}`,
    io,
    async close() {
      closing = true;
      for (const t of timeouts.values()) clearTimeout(t);
      timeouts.clear();
      await io.close(); // also closes the HTTP server and disconnects every socket
      // Disconnect handlers may still be broadcasting; let them finish before storage closes.
      while (background.size > 0) await Promise.allSettled([...background]);
    },
  };
}
