import type { HexKey, VertexId } from "../../board/graph";
import { hexKey, hexNeighbors } from "../../board/hex";
import { reject } from "../../module";
import type { GameState, PlayerId, Rejection } from "../../types";
import { WATER } from "./data";
import { scenarioOf, seaState } from "./scenario";

/**
 * Every land hex's region: its `region` label from the map if it has one, otherwise the landmass
 * it belongs to (unlabelled land hexes joined through neighbours), named after its first hex key.
 */
export function computeRegions(state: GameState): Record<HexKey, string> {
  const land = state.map.hexes.filter((h) => !WATER.has(h.terrain));
  const regionOf: Record<HexKey, string> = {};
  const unlabelled = new Set<HexKey>();
  for (const h of land) {
    if (h.region) regionOf[hexKey(h)] = h.region;
    else unlabelled.add(hexKey(h));
  }
  for (const start of [...unlabelled].sort()) {
    if (regionOf[start]) continue;
    const name = `island:${start}`;
    const queue = [start];
    while (queue.length > 0) {
      const key = queue.pop()!;
      if (regionOf[key]) continue;
      regionOf[key] = name;
      const [q, r] = key.split(",").map(Number);
      for (const n of hexNeighbors({ q: q!, r: r! })) {
        const nk = hexKey(n);
        if (unlabelled.has(nk) && !regionOf[nk]) queue.push(nk);
      }
    }
  }
  return regionOf;
}

/** The regions a corner touches (usually one; a corner between two labelled areas touches both). */
export function regionsAt(state: GameState, vertex: VertexId): string[] {
  const { regionOf } = seaState(state);
  const out = new Set<string>();
  for (const hex of state.graph.vertices.get(vertex)?.hexes ?? []) {
    const region = regionOf[hex];
    if (region) out.add(region);
  }
  return [...out].sort();
}

/** Starting settlements only where the scenario allows. */
export function checkSetupRegion(state: GameState, vertex: VertexId): Rejection | null {
  const allowed = scenarioOf(state).setupRegions;
  if (!allowed || regionsAt(state, vertex).some((r) => allowed.includes(r))) return null;
  return reject("ILLEGAL_PLACEMENT", "Starting settlements must go on a home island.");
}

/** With home regions chosen in setup, each starting settlement makes its regions home. */
export function recordHome(draft: GameState, player: PlayerId, vertex: VertexId): void {
  if (scenarioOf(draft).home !== "setup") return;
  const sea = seaState(draft);
  sea.home[player] = [
    ...new Set([...(sea.home[player] ?? []), ...regionsAt(draft, vertex)]),
  ].sort();
}

/**
 * Island bonus: the scenario's bonus for each region (other than the player's home regions) where
 * they have a settlement or city. Computed from the pieces; buildings are never removed.
 */
export function islandBonusVP(state: GameState, player: PlayerId): number {
  const bonus = scenarioOf(state).islandBonus;
  if (bonus === 0) return 0;
  const home = new Set(seaState(state).home[player] ?? []);
  const settled = new Set<string>();
  for (const piece of Object.values(state.pieces)) {
    if (piece.owner !== player || !("vertex" in piece.at)) continue;
    if (piece.type !== "settlement" && piece.type !== "city") continue;
    for (const region of regionsAt(state, piece.at.vertex))
      if (!home.has(region)) settled.add(region);
  }
  return bonus * settled.size;
}
