import type { GameEvent, GameState, PlayerId } from "../../types";
import { baseState, buildingAt, roadAt } from "./helpers";

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
 * Length of `player`'s longest road: the most of their roads walkable without reusing one.
 * A route can end at, but not pass through, a corner with an opponent's settlement or city.
 */
export function longestRoad(state: GameState, player: PlayerId): number {
  const mine = [...state.graph.edges.keys()].filter((e) => roadAt(state, e)?.owner === player);
  if (mine.length === 0) return 0;
  const mineSet = new Set(mine);
  const blocked = (vertex: string) => {
    const b = buildingAt(state, vertex);
    return b !== undefined && b.owner !== player;
  };

  const used = new Set<string>();
  function walk(vertex: string): number {
    let best = 0;
    for (const edge of state.graph.vertices.get(vertex)!.edges) {
      if (!mineSet.has(edge) || used.has(edge)) continue;
      const [a, b] = state.graph.edges.get(edge)!.vertices;
      const next = a === vertex ? b : a;
      used.add(edge);
      best = Math.max(best, 1 + (blocked(next) ? 0 : walk(next)));
      used.delete(edge);
    }
    return best;
  }

  let best = 0;
  for (const edge of mine) {
    for (const vertex of state.graph.edges.get(edge)!.vertices) best = Math.max(best, walk(vertex));
  }
  return best;
}

function knightsPlayed(state: GameState, player: PlayerId): number {
  return state.zones[`played-${player}`]?.contents["knight"] ?? 0;
}

/** Recompute both awards; call after anything that can change roads, buildings or knights. */
export function updateAwards(draft: GameState, events: GameEvent[]): void {
  const base = baseState(draft);
  const roads: Record<PlayerId, number> = {};
  const army: Record<PlayerId, number> = {};
  for (const p of draft.players) {
    roads[p] = longestRoad(draft, p);
    army[p] = knightsPlayed(draft, p);
  }
  const road = awardHolder(base.longestRoad, roads, LONGEST_ROAD_MIN);
  if (road !== base.longestRoad) {
    events.push({
      type: "AWARD",
      text: road
        ? `${road} now has the Longest Road (${roads[road]})`
        : "Nobody holds the Longest Road now",
      data: { award: "longestRoad", holder: road },
    });
    base.longestRoad = road;
  }
  const largest = awardHolder(base.largestArmy, army, LARGEST_ARMY_MIN);
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
