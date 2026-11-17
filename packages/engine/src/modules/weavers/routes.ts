import type { EdgeId, VertexId } from "../../board/graph";
import type { GameState, Piece, PlayerId } from "../../types";
import { buildingAt, edgePieceAt } from "../base/helpers";

/** Pieces that make up a player's route: roads and ships. */
const ROUTE = new Set(["road", "ship"]);

/**
 * Corners `player` reaches along their own roads and ships from `starts`, never using `without`.
 * Joined as for the longest route: a route can't pass an opponent's building (it may end there),
 * and roads and ships join only at the player's own building. Returns each corner with the piece
 * types it was reached by (null: a starting corner).
 */
export function reach(
  state: GameState,
  player: PlayerId,
  starts: VertexId[],
  without?: EdgeId,
): Map<VertexId, Set<string | null>> {
  const seen = new Map<VertexId, Set<string | null>>();
  const queue: [VertexId, string | null][] = starts.map((v) => [v, null]);
  const ownAt = (v: VertexId) => buildingAt(state, v)?.owner === player;
  while (queue.length > 0) {
    const [v, came] = queue.pop()!;
    const types = seen.get(v) ?? new Set();
    if (types.has(came)) continue;
    types.add(came);
    seen.set(v, types);
    const building = buildingAt(state, v);
    if (came !== null && building && building.owner !== player) continue; // can't pass through
    for (const edge of state.graph.vertices.get(v)?.edges ?? []) {
      if (edge === without) continue;
      const piece = edgePieceAt(state, edge);
      if (!piece || piece.owner !== player || !ROUTE.has(piece.type)) continue;
      if (came !== null && piece.type !== came && !ownAt(v)) continue;
      const [a, b] = state.graph.edges.get(edge)!.vertices;
      queue.push([a === v ? b : a, piece.type]);
    }
  }
  return seen;
}

/** Corners with one of `player`'s settlements or cities. */
export function ownBuildingCorners(state: GameState, player: PlayerId): VertexId[] {
  return Object.values(state.pieces).flatMap((p) =>
    p.owner === player && (p.type === "settlement" || p.type === "city") && "vertex" in p.at
      ? [p.at.vertex]
      : [],
  );
}

/**
 * Is this ship part of a route joining one of its owner's buildings to a village? Then it's
 * "closed" and may not move. True when one end reaches a building and the other reaches a village
 * without using the ship itself, each by a ship (or where it may switch).
 */
export function onClosedRoute(state: GameState, ship: Piece, villages: VertexId[]): boolean {
  if (!ship.owner || !("edge" in ship.at)) return false;
  const edge = ship.at.edge;
  const [a, b] = state.graph.edges.get(edge)!.vertices;
  const fromBuildings = reach(state, ship.owner, ownBuildingCorners(state, ship.owner), edge);
  const fromVillages = reach(state, ship.owner, villages, edge);
  const own = (v: VertexId) => buildingAt(state, v)?.owner === ship.owner;
  // The ship joins what reached its end if that came by ship, started there, or may switch there.
  const joins = (m: Map<VertexId, Set<string | null>>, v: VertexId) => {
    const types = m.get(v);
    return !!types && (types.has(null) || types.has("ship") || own(v));
  };
  return (
    (joins(fromBuildings, a) && joins(fromVillages, b)) ||
    (joins(fromBuildings, b) && joins(fromVillages, a))
  );
}
