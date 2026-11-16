import { randomBytes, randomUUID } from "node:crypto";
import { seedFromString } from "@settlers/engine";
import { BASE_4P, generateMap } from "@settlers/maps";
import type { Ack, CreateLobbyParsed } from "@settlers/protocol";
import { fail } from "./errors";
import type { KeyedQueue } from "./queue";
import type { GamePlayer, GameRecord, LobbyRecord, Store } from "./store/types";

/** Lobby rules: who sits where, readiness, and starting the game. Every change runs on the lobby's queue. */
export class LobbyService {
  constructor(
    private store: Store,
    private queue: KeyedQueue,
  ) {}

  async create(hostId: string, opts: CreateLobbyParsed): Promise<LobbyRecord> {
    const lobby: LobbyRecord = {
      id: randomBytes(6).toString("base64url"),
      hostId,
      maxSeats: opts.maxSeats,
      allowSpectators: opts.allowSpectators,
      turnSeconds: opts.turnSeconds,
      seats: Array.from({ length: opts.maxSeats }, (_, i) =>
        i === 0 ? { userId: hostId, ready: false } : null,
      ),
      status: "open",
      gameId: null,
    };
    await this.store.createLobby(lobby);
    return lobby;
  }

  get(id: string): Promise<LobbyRecord | null> {
    return this.store.getLobby(id);
  }

  /** Sit in `seat`, moving from any other seat; or stand up when `seat` is null. */
  takeSeat(lobbyId: string, userId: string, seat: number | null): Promise<Ack> {
    return this.queue.run(`lobby:${lobbyId}`, async () => {
      const lobby = await this.store.getLobby(lobbyId);
      if (!lobby) return fail("NOT_FOUND");
      if (lobby.status !== "open") return fail("LOBBY_STARTED");
      if (seat !== null && (seat >= lobby.maxSeats || seat < 0)) return fail("BAD_REQUEST");
      if (seat !== null && lobby.seats[seat] && lobby.seats[seat]!.userId !== userId) {
        return fail("SEAT_TAKEN");
      }
      lobby.seats = lobby.seats.map((s) => (s?.userId === userId ? null : s));
      if (seat !== null) lobby.seats[seat] = { userId, ready: false };
      await this.store.saveLobby(lobby);
      return { ok: true };
    });
  }

  setReady(lobbyId: string, userId: string, ready: boolean): Promise<Ack> {
    return this.queue.run(`lobby:${lobbyId}`, async () => {
      const lobby = await this.store.getLobby(lobbyId);
      if (!lobby) return fail("NOT_FOUND");
      if (lobby.status !== "open") return fail("LOBBY_STARTED");
      const mine = lobby.seats.find((s) => s?.userId === userId);
      if (!mine) return fail("BAD_REQUEST", "Take a seat first.");
      mine.ready = ready;
      await this.store.saveLobby(lobby);
      return { ok: true };
    });
  }

  /** Host only. Every seat must be filled and ready. Seat i plays as engine seat "p<i>". */
  start(lobbyId: string, userId: string): Promise<Ack<{ gameId: string }>> {
    return this.queue.run(`lobby:${lobbyId}`, async () => {
      const lobby = await this.store.getLobby(lobbyId);
      if (!lobby) return fail("NOT_FOUND");
      if (lobby.hostId !== userId) return fail("NOT_HOST");
      if (lobby.status !== "open") return fail("LOBBY_STARTED");
      if (!lobby.seats.every((s) => s?.ready)) return fail("NOT_READY");

      // The server isn't bound by engine purity: the seed comes from the OS.
      const seed = randomBytes(16).toString("hex");
      const { map } = generateMap(BASE_4P, seedFromString(`${seed}:map`));
      const players: GamePlayer[] = lobby.seats.map((s, i) => ({
        seat: `p${i}`,
        userId: s!.userId,
      }));
      const game: GameRecord = {
        id: randomUUID(),
        lobbyId,
        map,
        modules: ["base"],
        seed,
        seats: players.map((p) => p.seat),
        status: "active",
        turnSeconds: lobby.turnSeconds,
      };
      lobby.status = "started";
      lobby.gameId = game.id;
      await this.store.startGame(lobby, game, players);
      return { ok: true, gameId: game.id };
    });
  }
}
