import { DEFAULT_MAP_ID, MAP_CATALOG, findMap, type CatalogMap } from "./catalog";
import {
  SCENARIO_CATALOG,
  scenarioOfMap,
  type CatalogScenario,
  type PlayerSize,
} from "./scenarios";
import type { MapDef } from "./schema";

/**
 * A game type (spec 023): a rule set and a player count. The host picks one, then a map that
 * belongs to it. A player count is an upper bound: fewer players may start.
 */
export interface GameType {
  id: GameTypeId;
  /** Our own wording. */
  name: string;
  description: string;
  maxPlayers: number;
  /** Seafaring types: which of a scenario's maps they play (the rulebook's 3- or 4-player map). */
  size?: PlayerSize;
}

export const GAME_TYPE_IDS = ["base", "seafaring-3", "seafaring-4"] as const;
export type GameTypeId = (typeof GAME_TYPE_IDS)[number];

export const GAME_TYPES: readonly GameType[] = [
  {
    id: "base",
    name: "Base game",
    description: "The classic rules on one island: roads, settlements and cities.",
    maxPlayers: 4,
  },
  {
    id: "seafaring-3",
    name: "Seafaring · 3 players",
    description: "Ships, islands and gold, on maps made for up to three players.",
    maxPlayers: 3,
    size: "3p",
  },
  {
    id: "seafaring-4",
    name: "Seafaring · 4 players",
    description: "Ships, islands and gold, on maps made for up to four players.",
    maxPlayers: 4,
    size: "4p",
  },
];

export function findGameType(id: string): GameType | undefined {
  return GAME_TYPES.find((t) => t.id === id);
}

const isSeafaring = (def: MapDef) => def.modules.includes("seafaring");

/**
 * The plain maps a game type offers: base-only maps for the base game; seafaring maps without
 * scenario rules ("free play") for the seafaring types, when they're made for that many players.
 */
export function mapsForType(type: GameType): CatalogMap[] {
  return MAP_CATALOG.filter((m) =>
    type.size ? isSeafaring(m.def) && m.def.players.max >= type.maxPlayers : !isSeafaring(m.def),
  );
}

/** The scenarios a game type offers (seafaring types only), each with a map for its size. */
export function scenariosForType(type: GameType): CatalogScenario[] {
  const size = type.size;
  if (!size) return [];
  return SCENARIO_CATALOG.filter((s) => s.maps[`${size}-fixed`]);
}

/** A game type's map from a lobby choice, or undefined if the map doesn't belong to it. */
export function mapForType(
  type: GameType,
  choice: { builtin: string } | { scenario: string; setup: "fixed" | "variable" },
): MapDef | undefined {
  if ("builtin" in choice) {
    return mapsForType(type).find((m) => m.id === choice.builtin)?.def;
  }
  if (!type.size) return undefined;
  return scenariosForType(type).find((s) => s.id === choice.scenario)?.maps[
    `${type.size}-${choice.setup}`
  ];
}

/** The map a new lobby of this type starts with: the base map, or the type's first scenario. */
export function defaultMapForType(type: GameType): MapDef {
  if (!type.size) return findMap(DEFAULT_MAP_ID)!.def;
  return scenariosForType(type)[0]!.maps[`${type.size}-fixed`]!;
}

/** The most seats a lobby of this type may have on this map (spec 229). */
export function seatCap(type: GameType, def: MapDef): number {
  return Math.min(type.maxPlayers, def.players.max);
}

/** The base game's discard limit, for maps that don't set their own. */
export const DEFAULT_DISCARD_LIMIT = 7;

/** What a lobby's settings start at, and reset to on a map or type change (spec 229). */
export interface MapDefaults {
  maxSeats: number;
  vpToWin: number;
  discardLimit: number;
}

export function mapDefaults(type: GameType, def: MapDef): MapDefaults {
  return {
    maxSeats: seatCap(type, def),
    vpToWin: def.vpToWin,
    discardLimit: def.discardLimit ?? DEFAULT_DISCARD_LIMIT,
  };
}

/**
 * The game type a stored map belongs to (lobbies saved before game types existed): a scenario map
 * by its size, another seafaring map by its player count, anything else the base game.
 */
export function gameTypeOfMap(def: MapDef): GameTypeId {
  const scenario = scenarioOfMap(def.id);
  if (scenario) return def.id.includes("-3p-") ? "seafaring-3" : "seafaring-4";
  if (isSeafaring(def)) return def.players.max <= 3 ? "seafaring-3" : "seafaring-4";
  return "base";
}
