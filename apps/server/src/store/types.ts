import type { Action, GameEvent, MapInput, PlayerId, StateSnapshot } from "@settlers/engine";
import type { GameSummary } from "@settlers/protocol";

export interface Profile {
  /** Supabase auth user id, or "dev:<name>" in dev mode. */
  id: string;
  username: string | null;
}

export interface LobbySeatRecord {
  userId: string;
  ready: boolean;
}

export interface LobbyRecord {
  id: string;
  hostId: string;
  maxSeats: number;
  allowSpectators: boolean;
  seats: (LobbySeatRecord | null)[];
  status: "open" | "started";
  gameId: string | null;
}

export interface GameRecord {
  id: string;
  lobbyId: string;
  map: MapInput;
  modules: string[];
  seed: string;
  seats: PlayerId[];
  status: "active" | "finished";
}

/** Seat ↔ account mapping. The engine only ever sees the seat. */
export interface GamePlayer {
  seat: PlayerId;
  userId: string;
}

/** A friend request (pending) or friendship (accepted). One per pair of users. */
export interface FriendshipRecord {
  requesterId: string;
  addresseeId: string;
  status: "pending" | "accepted";
}

/** How a game ended. Scores are full VP (hidden cards included). */
export interface GameResult {
  winner: PlayerId;
  scores: Record<PlayerId, number>;
}

export interface StoredAction {
  /** 1-based, contiguous per game. */
  seq: number;
  /** Seat id, or "system". */
  actor: string;
  action: Action;
  /** Events the engine emitted, kept so the log survives restarts. */
  events: GameEvent[];
}

/** Everything the server persists. Postgres in production; in-memory for unit tests. */
export interface Store {
  /** Get the profile, creating an empty one on first sign-in. */
  ensureProfile(userId: string): Promise<Profile>;
  getProfiles(userIds: string[]): Promise<Profile[]>;
  setUsername(userId: string, username: string): Promise<"ok" | "taken">;
  /** Case-insensitive. */
  findProfileByUsername(username: string): Promise<Profile | null>;

  /** Every request or friendship that involves `userId`, either way round. */
  listFriendships(userId: string): Promise<FriendshipRecord[]>;
  /** Insert, or replace the row for the same pair (either direction). */
  saveFriendship(f: FriendshipRecord): Promise<void>;
  /** Delete the row between `a` and `b`, whichever way round it is. */
  deleteFriendship(a: string, b: string): Promise<void>;

  createLobby(lobby: LobbyRecord): Promise<void>;
  getLobby(id: string): Promise<LobbyRecord | null>;
  saveLobby(lobby: LobbyRecord): Promise<void>;

  /** Atomically create the game, its players, and mark the lobby started. */
  startGame(lobby: LobbyRecord, game: GameRecord, players: GamePlayer[]): Promise<void>;
  getGame(id: string): Promise<{ game: GameRecord; players: GamePlayer[] } | null>;

  /** Must be durable before the server broadcasts the new state. */
  appendAction(gameId: string, action: StoredAction): Promise<void>;
  actionsAfter(gameId: string, seq: number): Promise<StoredAction[]>;
  saveSnapshot(gameId: string, seq: number, state: StateSnapshot): Promise<void>;
  /** Mark the game finished, with a final snapshot and the result. */
  finishGame(gameId: string, seq: number, state: StateSnapshot, result: GameResult): Promise<void>;
  /** Games `userId` sat in, newest first. */
  gamesForUser(userId: string, limit: number): Promise<GameSummary[]>;
  latestSnapshot(gameId: string): Promise<{ seq: number; state: StateSnapshot } | null>;

  close(): Promise<void>;
}
