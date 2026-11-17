import { routeAwardName, routePieceTypes, type RulesModule } from "../../module";
import type { GameEvent, GameState, PlayerId } from "../../types";
import { baseState, buildingAt, featureOn } from "./helpers";

export const LONGEST_ROAD_MIN = 5;
export const LARGEST_ARMY_MIN = 3;

/**
 * Who holds an award, given each player's score for it:
 * - the current holder keeps it on a tie for the lead;
 * - otherwise the unique leader at or above the threshold takes it;
 * - if the leaders are tied (or nobody qualifies), nobody holds it.
 */
export function awardHolder(
  current: PlayerId | null,
  scores: Record<PlayerId, number>,
  threshold: number,
): PlayerId | null {
  const best = Math.max(0, ...Object.values(scores));
  if (best < threshold) return null;
  if (current !== null && scores[current] === best) return current;
  const leaders = Object.keys(scores).filter((p) => scores[p] === best);
  return leaders.length === 1 ? leaders[0]! : null;
}

/**
 * Length of `player`'s longest route: the most of their route pieces (`types`, e.g. roads, or
 * roads and ships) walkable without reusing one. A route can end at, but not pass through, a
 * corner with an opponent's settlement or city, and can switch piece type (road ↔ ship) only at a
 * corner with the player's own building.
 */
export function longestRoute(
  state: GameState,
  player: PlayerId,
  types: readonly string[] = ["road"],
): number {
  const typeOf = new Map<string, string>();
  for (const piece of Object.values(state.pieces)) {
    if (piece.owner === player && "edge" in piece.at && types.includes(piece.type)) {
      typeOf.set(piece.at.edge, piece.type);
    }
  }
  if (typeOf.size === 0) return 0;
  const blocked = (vertex: string) => {
    const b = buildingAt(state, vertex);
    return b !== undefined && b.owner !== player;
  };
  const ownBuilding = (vertex: string) => buildingAt(state, vertex)?.owner === player;

  const used = new Set<string>();
  /** Longest walk leaving `vertex`, having arrived on a piece of type `arrived` (null at the start). */
  function walk(vertex: string, arrived: string | null): number {
    let best = 0;
    for (const edge of state.graph.vertices.get(vertex)!.edges) {
      const type = typeOf.get(edge);
      if (type === undefined || used.has(edge)) continue;
      if (arrived !== null && type !== arrived && !ownBuilding(vertex)) continue;
      const [a, b] = state.graph.edges.get(edge)!.vertices;
      const next = a === vertex ? b : a;
      used.add(edge);
      best = Math.max(best, 1 + (blocked(next) ? 0 : walk(next, type)));
      used.delete(edge);
    }
    return best;
  }

  let best = 0;
  for (const edge of typeOf.keys()) {
    for (const vertex of state.graph.edges.get(edge)!.vertices)
      best = Math.max(best, walk(vertex, null));
  }
  return best;
}

/** Roads only: the base game's Longest Road. */
export const longestRoad = (state: GameState, player: PlayerId): number =>
  longestRoute(state, player, ["road"]);

function knightsPlayed(state: GameState, player: PlayerId): number {
  return state.zones[`played-${player}`]?.contents["knight"] ?? 0;
}

/** Recompute both awards; call after anything that can change roads, buildings or knights. */
export function updateAwards(draft: GameState, events: GameEvent[], modules: RulesModule[]): void {
  const base = baseState(draft);
  const types = routePieceTypes(modules);
  const name = routeAwardName(modules);
  const roads: Record<PlayerId, number> = {};
  const army: Record<PlayerId, number> = {};
  for (const p of draft.players) {
    roads[p] = longestRoute(draft, p, types);
    army[p] = knightsPlayed(draft, p);
  }
  // A switched-off award is never held (nor announced).
  const road = featureOn(draft, "longestRoad")
    ? awardHolder(base.longestRoad, roads, LONGEST_ROAD_MIN)
    : null;
  if (road !== base.longestRoad) {
    events.push({
      type: "AWARD",
      text: road ? `${road} now has the ${name} (${roads[road]})` : `Nobody holds the ${name} now`,
      data: { award: "longestRoad", holder: road },
    });
    base.longestRoad = road;
  }
  const largest =
    featureOn(draft, "largestArmy") && featureOn(draft, "devCards")
      ? awardHolder(base.largestArmy, army, LARGEST_ARMY_MIN)
      : null;
  if (largest !== base.largestArmy) {
    events.push({
      type: "AWARD",
      text: `${largest} now has the Largest Army (${largest ? army[largest] : 0})`,
      data: { award: "largestArmy", holder: largest },
    });
    base.largestArmy = largest;
  }
}

export function awardVP(state: GameState, player: PlayerId): number {
  const base = baseState(state);
  return (base.longestRoad === player ? 2 : 0) + (base.largestArmy === player ? 2 : 0);
}
