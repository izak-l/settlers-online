import type { BoardGraph, EdgeId, HexKey, VertexId } from "./board/graph";
import type { RngState } from "./rng";

/** A seat in one game. The engine never knows about user accounts. */
export type PlayerId = string;
/** "system" is the server acting on a player's behalf (timeouts). */
export type Actor = PlayerId | "system";

export type ModuleId = string;
export type ResourceId = string;
export type PieceTypeId = string;
export type PieceId = string;
export type ZoneId = string;

export type Resources = Record<ResourceId, number>;

/** The map the engine plays on: every pool already resolved to a concrete value. */
export interface MapInput {
  id: string;
  vpToWin: number;
  /** `region` labels an area of the map (e.g. "main"); modules give it meaning (spec 015). */
  hexes: { q: number; r: number; terrain: string; token?: number; region?: string }[];
  ports: { edgeId: EdgeId; type: string }[];
  robberStart?: string;
  /**
   * Scenario settings, read and checked by the modules that use them (e.g. seafaring's island
   * bonus and pirate start). The core only carries it.
   */
  scenario?: Record<string, unknown>;
  /** Base-game parts this map turns on or off (spec 014). */
  features?: FeatureOverrides;
}

export interface RulesetDef {
  /** Module ids in the order their hooks run. */
  modules: ModuleId[];
  options?: { vpToWin?: number; features?: FeatureOverrides };
}

/** Parts of the base game that a map, the lobby or a module can switch off (spec 014). */
export const FEATURE_IDS = ["devCards", "robber", "longestRoad", "largestArmy", "ports"] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];
export type Features = Record<FeatureId, boolean>;
/** Some switches set, others left to an earlier source (map JSON, lobby house rules). */
export type FeatureOverrides = { [K in FeatureId]?: boolean | undefined };

/** Every feature on: the plain base game. */
export const BASE_FEATURES: Features = {
  devCards: true,
  robber: true,
  longestRoad: true,
  largestArmy: true,
  ports: true,
};

/** Later sources win; a switch a source leaves out (or sets to undefined) keeps the earlier value. */
export function mergeFeatures(...sources: (FeatureOverrides | undefined)[]): Features {
  const out: Features = { ...BASE_FEATURES };
  for (const src of sources) {
    for (const id of FEATURE_IDS) {
      const value = src?.[id];
      if (value !== undefined) out[id] = value;
    }
  }
  return out;
}

export interface GameOptions {
  vpToWin: number;
  /** Which base-game features are on. Games saved before switches existed have none: all on. */
  features: Features;
}

export type PieceLocation = { vertex: VertexId } | { edge: EdgeId } | { hex: HexKey };

export interface Piece {
  id: PieceId;
  type: PieceTypeId;
  owner?: PlayerId;
  at: PieceLocation;
}

export type ZoneVisibility = "public" | "owner" | "count" | "hidden";

export interface Zone {
  id: ZoneId;
  owner?: PlayerId;
  visibility: ZoneVisibility;
  contents: Resources;
}

export interface Decision {
  kind: string;
  /** Who must act (can be several at once). */
  actors: PlayerId[];
  /** Who hasn't acted yet. */
  pendingFrom: PlayerId[];
  allowed: string[];
  /** Module that owns the resolution logic. */
  module: ModuleId;
  data?: Record<string, unknown>;
  /**
   * Which clock the server's turn timer uses while this is on top: omitted means the turn clock;
   * "short" is a quick clock for decisions others must answer (e.g. discards).
   */
  timer?: "short";
}

export interface GameState {
  /** e.g. "base@1" */
  rulesetId: string;
  modules: ModuleId[];
  options: GameOptions;
  rng: RngState;
  map: MapInput;
  /** Derived from `map`; never mutated, shared between states. Rebuild it when deserializing. */
  graph: BoardGraph;
  players: PlayerId[];
  pieces: Record<PieceId, Piece>;
  zones: Record<ZoneId, Zone>;
  turn: { number: number; activePlayer: PlayerId };
  /** Stack: the last element is the decision that must be resolved next. */
  decisions: Decision[];
  moduleState: Record<ModuleId, unknown>;
  winner?: PlayerId;
}

export interface GameEvent {
  type: string;
  /** Human-readable line for the game log. */
  text: string;
  /** Only these players may see this event (spectators never). Omitted means everyone. */
  visibleTo?: PlayerId[];
  /** Everyone may see this event (spectators included) except these players. */
  hiddenFrom?: PlayerId[];
  data?: Record<string, unknown>;
}

/** The one rule for who sees an event; used by the server and the dev sandbox. */
export function eventVisibleTo(event: GameEvent, viewer: PlayerId | "spectator"): boolean {
  if (event.visibleTo) return viewer !== "spectator" && event.visibleTo.includes(viewer);
  if (event.hiddenFrom) return viewer === "spectator" || !event.hiddenFrom.includes(viewer);
  return true;
}

export const ERROR_CODES = [
  "NOT_YOUR_TURN",
  "WRONG_DECISION",
  "CANNOT_AFFORD",
  "ILLEGAL_PLACEMENT",
  "PIECE_LIMIT",
  "BANK_EMPTY",
  "INVALID_TRADE",
  "INVALID_CHOICE",
  "GAME_OVER",
  "UNKNOWN_ACTION",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** UI copy for every error code. */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  NOT_YOUR_TURN: "It's not your turn to do that.",
  WRONG_DECISION: "That move isn't allowed right now.",
  CANNOT_AFFORD: "You don't have the resources for that.",
  ILLEGAL_PLACEMENT: "You can't place that there.",
  PIECE_LIMIT: "You have no pieces of that type left.",
  BANK_EMPTY: "The bank has run out of that resource.",
  INVALID_TRADE: "That trade isn't valid.",
  INVALID_CHOICE: "That choice isn't allowed.",
  GAME_OVER: "The game is over.",
  UNKNOWN_ACTION: "Unknown action.",
};

export interface Rejection {
  ok: false;
  code: ErrorCode;
  message: string;
}

export type ApplyResult = { ok: true; state: GameState; events: GameEvent[] } | Rejection;
