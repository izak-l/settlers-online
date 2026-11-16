import type { GameState, PlayerId } from "../../types";
import { terrainAt } from "../base/helpers";
import { SHIP_LIMIT, WATER } from "./data";
import { scenarioOf, seaState } from "./scenario";

/**
 * Seafaring's checks after every action (tests and the fuzzer), and the island bonus recounted
 * from scratch (not via `islandBonusVP`) so the shared VP check catches a wrong bonus.
 */
export function seafaringInvariants(state: GameState): {
  violations: string[];
  vp: Record<PlayerId, number>;
} {
  const out: string[] = [];
  const vp: Record<PlayerId, number> = {};
  const sea = seaState(state);
  const bonus = scenarioOf(state).islandBonus;

  for (const p of state.players) {
    const ships = Object.values(state.pieces).filter((x) => x.type === "ship" && x.owner === p);
    if (ships.length > SHIP_LIMIT) out.push(`${p} has ${ships.length} ships (limit ${SHIP_LIMIT})`);
    for (const ship of ships) {
      if (!("edge" in ship.at) || !state.graph.edges.has(ship.at.edge))
        out.push(`ship ${ship.id} is not on an edge`);
    }

    const home = new Set(sea.home[p] ?? []);
    const foreign = new Set<string>();
    for (const piece of Object.values(state.pieces)) {
      if (piece.owner !== p || !("vertex" in piece.at)) continue;
      if (piece.type !== "settlement" && piece.type !== "city") continue;
      for (const hex of state.graph.vertices.get(piece.at.vertex)!.hexes) {
        const region = sea.regionOf[hex];
        if (region && !home.has(region)) foreign.add(region);
      }
    }
    vp[p] = bonus * foreign.size;
  }

  const robber = state.pieces["robber"];
  if (robber && "hex" in robber.at && WATER.has(terrainAt(state, robber.at.hex) ?? "sea"))
    out.push(`the robber is on water (${robber.at.hex})`);
  const pirate = state.pieces["pirate"];
  if (pirate) {
    if (!sea.pirateInPlay) out.push("a pirate is on the board in a scenario without one");
    if (!("hex" in pirate.at) || terrainAt(state, pirate.at.hex) !== "sea")
      out.push("the pirate is not on a sea hex");
  }
  return { violations: out, vp };
}
