import type { EdgeId } from "../../board/graph";
import { reject, type ActionHandlers } from "../../module";
import type { GameState, PlayerId } from "../../types";
import { isLandEdge, popDecision } from "../base/helpers";
import { isShipEdge } from "../seafaring/ships";
import { lostState } from "./markers";

/** Edges sharing a corner with `edge` (and `edge` itself). */
function edgesAround(state: GameState, edge: EdgeId): Set<EdgeId> {
  const out = new Set<EdgeId>([edge]);
  for (const v of state.graph.edges.get(edge)?.vertices ?? [])
    for (const e of state.graph.vertices.get(v)!.edges) out.add(e);
  return out;
}

/**
 * Where `player` may put a harbor: a coast edge (land on one side, water or the frame on the
 * other) at a corner with one of their settlements or cities, with at least one edge between it
 * and every other harbor (no harbor on it or on any edge sharing a corner with it).
 */
export function harborSpots(state: GameState, player: PlayerId): EdgeId[] {
  const blocked = new Set<EdgeId>();
  for (const port of state.map.ports)
    for (const e of edgesAround(state, port.edgeId)) blocked.add(e);
  const spots = new Set<EdgeId>();
  for (const piece of Object.values(state.pieces)) {
    if (piece.owner !== player || !("vertex" in piece.at)) continue;
    if (piece.type !== "settlement" && piece.type !== "city") continue;
    for (const e of state.graph.vertices.get(piece.at.vertex)?.edges ?? []) {
      if (!blocked.has(e) && isLandEdge(state, e) && isShipEdge(state, e)) spots.add(e);
    }
  }
  return [...spots].sort();
}

export const canPlaceHarbor = (state: GameState, player: PlayerId): boolean =>
  harborSpots(state, player).length > 0;

export const harborActions: ActionHandlers = {
  /**
   * Place the oldest harbor you're holding. Its own decision right after a ship takes it; in your
   * main step for one you had to keep because there was nowhere to put it.
   */
  PLACE_HARBOR: {
    validate(state, player, { edge }) {
      if ((lostState(state).held[player] ?? []).length === 0)
        return reject("INVALID_CHOICE", "You aren't holding a harbor.");
      if (!harborSpots(state, player).includes(edge))
        return reject(
          "ILLEGAL_PLACEMENT",
          "Harbors go on a coast edge by your own building, at least one edge from other harbors.",
        );
      return null;
    },
    apply(draft, player, { edge }, { events }) {
      const type = lostState(draft).held[player]!.shift()!;
      draft.map.ports.push({ edgeId: edge, type });
      lostState(draft).placed.push(edge);
      events.push({
        type: "PLACED_HARBOR",
        text: `${player} placed a harbor`,
        data: { player, edge, port: type },
      });
      const top = draft.decisions.at(-1);
      if (top?.kind === "PLACE_HARBOR") popDecision(draft);
    },
    candidates: (state, player) =>
      harborSpots(state, player).map((edge) => ({ type: "PLACE_HARBOR", edge })),
  },
};
