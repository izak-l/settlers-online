import { randomBytes, randomUUID } from "node:crypto";
import {
  apply,
  createGame,
  mergeFeatures,
  MODULE_IDS,
  seedFromString,
  type Features,
} from "@settlers/engine";
import {
  defaultMapForType,
  findGameType,
  generateMap,
  mapDefaults,
  mapForType,
  seatCap,
  type GameType,
  type GameTypeId,
  type MapDef,
} from "@settlers/maps";
import type { Ack, CreateLobbyParsed, MapChoice, SetLobbySettings } from "@settlers/protocol";
import { fail } from "./errors";
import type { KeyedQueue } from "./queue";
import type { GamePlayer, GameRecord, LobbyRecord, Store } from "./store/types";

/** The switches a lobby's game will start with: all on, then the map's, then the house rules. */
export function effectiveFeatures(lobby: LobbyRecord): Features {
  return mergeFeatures(lobby.map.features, lobby.features);
}

/**
 * Give the lobby `n` seats. Seated players keep their seats when they all fit; otherwise they
 * move up into the first seats, in order. The caller checks that everyone fits.
 */
function resizeSeats(lobby: LobbyRecord, n: number): void {
  const fits = lobby.seats.every((s, i) => s === null || i < n);
  const seats = fits ? lobby.seats.slice(0, n) : lobby.seats.filter((s) => s !== null);
  lobby.seats = [...seats, ...Array<null>(Math.max(0, n - seats.length)).fill(null)];
  lobby.maxSeats = n;
}

const seatedCount = (lobby: LobbyRecord) => lobby.seats.filter((s) => s !== null).length;
const clearReady = (lobby: LobbyRecord) => {
  lobby.seats = lobby.seats.map((s) => (s ? { ...s, ready: false } : null));
};

/**
 * Put a new map in the lobby (spec 229): seats, points and discard limit go back to the map's
 * defaults. Fails when more players are seated than the map takes in this type.
 */
function useMap(lobby: LobbyRecord, type: GameType, def: MapDef): Ack {
  const defaults = mapDefaults(type, def);
  if (seatedCount(lobby) > defaults.maxSeats) {
    return fail(
      "BAD_REQUEST",
      `This is for up to ${defaults.maxSeats} players: ask someone to leave a seat first.`,
    );
  }
  lobby.gameType = type.id;
  lobby.map = def;
  lobby.vpToWin = defaults.vpToWin;
  lobby.discardLimit = defaults.discardLimit;
  resizeSeats(lobby, defaults.maxSeats);
  clearReady(lobby);
  return { ok: true };
}

/** Lobby rules: who sits where, readiness, and starting the game. Every change runs on the lobby's queue. */
export class LobbyService {
  constructor(
    private store: Store,
    private queue: KeyedQueue,
  ) {}

  async create(hostId: string, opts: CreateLobbyParsed): Promise<LobbyRecord | null> {
    const type = findGameType(opts.gameType);
    if (!type) return null;
    const map = defaultMapForType(type);
    // The settings start at the map's defaults (spec 229); older clients still send a seat count.
    const defaults = mapDefaults(type, map);
    const maxSeats = opts.maxSeats ?? defaults.maxSeats;
    if (maxSeats > defaults.maxSeats) return null;
    const lobby: LobbyRecord = {
      id: randomBytes(6).toString("base64url"),
      hostId,
      maxSeats,
      allowSpectators: opts.allowSpectators,
      turnSeconds: opts.turnSeconds,
      seats: Array.from({ length: maxSeats }, (_, i) =>
        i === 0 ? { userId: hostId, ready: false } : null,
      ),
      status: "open",
      gameId: null,
      map,
      features: {},
      gameType: type.id,
      vpToWin: defaults.vpToWin,
      discardLimit: defaults.discardLimit,
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

  /**
   * Host only, while open. The lobby keeps a copy of the map, so later catalog changes never
   * touch it. Seats, points and discard limit go back to the map's defaults (spec 229), and
   * everyone has to ready up again.
   */
  setMap(lobbyId: string, userId: string, choice: MapChoice): Promise<Ack> {
    return this.queue.run(`lobby:${lobbyId}`, async () => {
      const lobby = await this.store.getLobby(lobbyId);
      if (!lobby) return fail("NOT_FOUND");
      if (lobby.hostId !== userId) return fail("NOT_HOST");
      if (lobby.status !== "open") return fail("LOBBY_STARTED");
      // Only maps of the lobby's game type, at its player size (spec 023).
      const type = findGameType(lobby.gameType);
      const def = type ? mapForType(type, choice) : undefined;
      if (!type || !def) return fail("UNKNOWN_MAP");
      const ack = useMap(lobby, type, def);
      if (ack.ok) await this.store.saveLobby(lobby);
      return ack;
    });
  }

  /**
   * Host only, while open (spec 023): switch the game type. Everyone seated must fit the type's
   * default map; they move up into the first seats when needed. The lobby gets that map and its
   * default settings (spec 229), and everyone has to ready up again.
   */
  setType(lobbyId: string, userId: string, gameType: GameTypeId): Promise<Ack> {
    return this.queue.run(`lobby:${lobbyId}`, async () => {
      const lobby = await this.store.getLobby(lobbyId);
      if (!lobby) return fail("NOT_FOUND");
      if (lobby.hostId !== userId) return fail("NOT_HOST");
      if (lobby.status !== "open") return fail("LOBBY_STARTED");
      const type = findGameType(gameType);
      if (!type) return fail("BAD_REQUEST");
      const ack = useMap(lobby, type, defaultMapForType(type));
      if (!ack.ok) {
        return fail(
          "BAD_REQUEST",
          `${type.name} is for up to ${type.maxPlayers} players: ask someone to leave a seat first.`,
        );
      }
      await this.store.saveLobby(lobby);
      return ack;
    });
  }

  /**
   * Host only, while open (spec 229): seats, points to win, discard limit, turn timer and
   * spectators, sent whole. Seats can't exceed what the map takes in this type, nor drop below
   * the number seated. Everyone has to ready up again.
   */
  setSettings(
    lobbyId: string,
    userId: string,
    settings: Omit<SetLobbySettings, "lobbyId">,
  ): Promise<Ack> {
    return this.queue.run(`lobby:${lobbyId}`, async () => {
      const lobby = await this.store.getLobby(lobbyId);
      if (!lobby) return fail("NOT_FOUND");
      if (lobby.hostId !== userId) return fail("NOT_HOST");
      if (lobby.status !== "open") return fail("LOBBY_STARTED");
      const type = findGameType(lobby.gameType);
      if (!type) return fail("BAD_REQUEST");
      const cap = seatCap(type, lobby.map);
      if (settings.maxSeats > cap) {
        return fail("BAD_REQUEST", `This map is for up to ${cap} players.`);
      }
      if (settings.maxSeats < seatedCount(lobby)) {
        return fail(
          "BAD_REQUEST",
          "More players are seated than that: ask someone to leave first.",
        );
      }
      resizeSeats(lobby, settings.maxSeats);
      lobby.vpToWin = settings.vpToWin;
      lobby.discardLimit = settings.discardLimit;
      lobby.turnSeconds = settings.turnSeconds;
      lobby.allowSpectators = settings.allowSpectators;
      clearReady(lobby);
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

      const def = lobby.map;
      // Catalog maps are checked in CI; this guards lobbies saved before a module was removed.
      if (!def.modules.every((id) => MODULE_IDS.includes(id))) {
        return fail("SERVER_ERROR", "This map needs rules the server doesn't have.");
      }

      // The server isn't bound by engine purity: the seed comes from the OS.
      const seed = randomBytes(16).toString("hex");
      const generated = generateMap(def, seedFromString(`${seed}:map`)).map;
      // The lobby's switches and settings ride on the stored map, so the game (and every replay)
      // starts with them.
      const map = {
        ...generated,
        features: effectiveFeatures(lobby),
        vpToWin: lobby.vpToWin,
        discardLimit: lobby.discardLimit,
        // Every game opens with a roll-off for the first player (spec 231).
        firstPlayer: "roll" as const,
      };
      const players: GamePlayer[] = lobby.seats.map((s, i) => ({
        seat: `p${i}`,
        userId: s!.userId,
      }));
      const game: GameRecord = {
        id: randomUUID(),
        lobbyId,
        map,
        modules: def.modules,
        seed,
        seats: players.map((p) => p.seat),
        status: "active",
        turnSeconds: lobby.turnSeconds,
      };
      lobby.status = "started";
      lobby.gameId = game.id;
      await this.store.startGame(lobby, game, players);
      // Play the roll-off at once as the system: it's the game's first logged action.
      const opening = apply(createGame(map, { modules: def.modules }, game.seats, seed), "system", {
        type: "ROLL_FOR_ORDER",
      });
      if (!opening.ok) return fail("SERVER_ERROR", opening.message);
      await this.store.appendAction(game.id, {
        seq: 1,
        actor: "system",
        action: { type: "ROLL_FOR_ORDER" },
        events: opening.events,
      });
      return { ok: true, gameId: game.id };
    });
  }
}
