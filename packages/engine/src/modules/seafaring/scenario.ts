import type { HexKey } from "../../board/graph";
import type { GameState, PlayerId } from "../../types";

/**
 * The map's `scenario` block as seafaring reads it (spec 015). Every field is optional so a plain
 * island map works with defaults: no bonus, home islands chosen in setup, no pirate.
 */
export interface SeafaringScenario {
  /** VP for a player's first settlement in each region that isn't one of their home regions. */
  islandBonus: number;
  /** Home regions for everyone, or "setup": each player's are where their starting settlements are. */
  home: { regions: string[] } | "setup";
  /** Starting settlements must touch one of these regions. Omitted: anywhere. */
  setupRegions?: string[];
  /**
   * Where the pirate starts: a sea hex ("q,r"), or "frame" (in play, starting off the board).
   * Omitted: no pirate in this scenario.
   */
  pirateStart?: HexKey | "frame";
}

/** Read the scenario with defaults. Malformed fields are ignored here; the map validator rejects them. */
export function scenarioOf(state: GameState): SeafaringScenario {
  const raw = (state.map.scenario ?? {}) as Partial<SeafaringScenario>;
  return {
    islandBonus: typeof raw.islandBonus === "number" ? raw.islandBonus : 0,
    home:
      typeof raw.home === "object" && Array.isArray(raw.home.regions)
        ? { regions: raw.home.regions }
        : "setup",
    ...(Array.isArray(raw.setupRegions) ? { setupRegions: raw.setupRegions } : {}),
    ...(typeof raw.pirateStart === "string" ? { pirateStart: raw.pirateStart } : {}),
  };
}

/** What seafaring keeps in `moduleState.seafaring`. */
export interface SeafaringState {
  /** Land hex → its region (the map's label, or one region per unlabelled landmass). */
  regionOf: Record<HexKey, string>;
  /** Each player's home regions (from the map, or recorded as they place starting settlements). */
  home: Record<PlayerId, string[]>;
  /** Ship piece id → the turn it was built (ships can't move on that turn). */
  shipBuiltOn: Record<string, number>;
  /** The turn a ship last moved (one move per turn). */
  movedOnTurn: number;
  /** Whether this scenario has a pirate at all (it may be parked on the frame, off the board). */
  pirateInPlay: boolean;
}

export function seaState(state: GameState): SeafaringState {
  return state.moduleState["seafaring"] as SeafaringState;
}
