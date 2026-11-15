import type { EdgeId, VertexId } from "../../board/graph";
import { reject } from "../../module";
import type { Decision, GameState, Piece, PlayerId, Resources } from "../../types";
import { COSTS, PIECE_LIMITS } from "./data";

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

export function decision(
  kind: string,
  player: PlayerId,
  allowed: string[],
  data?: Record<string, unknown>,
): Decision {
  return {
    kind,
    actors: [player],
    pendingFrom: [player],
    allowed,
    module: "base",
    ...(data ? { data } : {}),
  };
}

export const rollDecision = (p: PlayerId): Decision => decision("ROLL", p, ["ROLL"]);

export const mainDecision = (p: PlayerId): Decision =>
  decision("MAIN", p, ["BUILD_ROAD", "BUILD_SETTLEMENT", "BUILD_CITY", "END_TURN"]);

export /** Pop the resolved decision and make whoever is next the active player. */
function popDecision(draft: GameState): void {
  draft.decisions.pop();
  const next = draft.decisions.at(-1);
  if (next) draft.turn.activePlayer = next.actors[0]!;
}

// ---------------------------------------------------------------------------
// Board queries
// ---------------------------------------------------------------------------

export function buildingAt(state: GameState, vertex: VertexId): Piece | undefined {
  return Object.values(state.pieces).find((p) => "vertex" in p.at && p.at.vertex === vertex);
}

export function roadAt(state: GameState, edge: EdgeId): Piece | undefined {
  return Object.values(state.pieces).find((p) => "edge" in p.at && p.at.edge === edge);
}

export function countOwned(state: GameState, player: PlayerId, type: string): number {
  return Object.values(state.pieces).filter((p) => p.owner === player && p.type === type).length;
}

/** Vertex is free and no neighbouring vertex has a building. */
export function distanceRuleOk(state: GameState, vertex: VertexId): boolean {
  const v = state.graph.vertices.get(vertex);
  if (!v || buildingAt(state, vertex)) return false;
  return v.neighbors.every((n) => !buildingAt(state, n));
}

/** A road connects at an endpoint with your building, or with your road unless an opponent's building sits there. */
export function roadConnects(state: GameState, player: PlayerId, edge: EdgeId): boolean {
  for (const vertex of state.graph.edges.get(edge)!.vertices) {
    const building = buildingAt(state, vertex);
    if (building?.owner === player) return true;
    if (building) continue; // opponent's building blocks the road network here
    const edges = state.graph.vertices.get(vertex)!.edges;
    if (edges.some((e) => e !== edge && roadAt(state, e)?.owner === player)) return true;
  }
  return false;
}

export function touchesOwnRoad(state: GameState, player: PlayerId, vertex: VertexId): boolean {
  return state.graph.vertices.get(vertex)!.edges.some((e) => roadAt(state, e)?.owner === player);
}

// ---------------------------------------------------------------------------
// Pieces and resources
// ---------------------------------------------------------------------------

function newPieceId(state: GameState, type: string, owner: PlayerId): string {
  const prefix = `${type}-${owner}-`;
  let n = 0;
  for (const id of Object.keys(state.pieces)) {
    if (!id.startsWith(prefix)) continue;
    const k = Number(id.slice(prefix.length));
    if (Number.isInteger(k) && k >= n) n = k + 1;
  }
  return `${prefix}${n}`;
}

export function addPiece(draft: GameState, type: string, owner: PlayerId, at: Piece["at"]): void {
  const id = newPieceId(draft, type, owner);
  draft.pieces[id] = { id, type, owner, at };
}

export function handOf(state: GameState, player: PlayerId): Resources {
  return state.zones[`hand-${player}`]!.contents;
}

export function canAfford(state: GameState, player: PlayerId, cost: Resources): boolean {
  const hand = handOf(state, player);
  return Object.entries(cost).every(([r, n]) => (hand[r] ?? 0) >= n);
}

/** Move `n` of a resource between two zones' contents. */
export function transfer(from: Resources, to: Resources, resource: string, n: number): void {
  from[resource] = (from[resource] ?? 0) - n;
  to[resource] = (to[resource] ?? 0) + n;
}

export function pay(draft: GameState, player: PlayerId, cost: Resources): void {
  const hand = handOf(draft, player);
  const bank = draft.zones["bank"]!.contents;
  for (const [r, n] of Object.entries(cost)) transfer(hand, bank, r, n);
}

export function describe(res: Resources): string {
  return Object.entries(res)
    .filter(([, n]) => n > 0)
    .map(([r, n]) => `${n} ${r}`)
    .join(", ");
}

export const allVertices = (s: GameState): VertexId[] => [...s.graph.vertices.keys()];
export const allEdges = (s: GameState): EdgeId[] => [...s.graph.edges.keys()];

export function checkLimitAndCost(state: GameState, player: PlayerId, type: string) {
  if (countOwned(state, player, type) >= PIECE_LIMITS[type]!) {
    return reject("PIECE_LIMIT", `You have no ${type}s left.`);
  }
  if (!canAfford(state, player, COSTS[type]!)) {
    return reject("CANNOT_AFFORD", `A ${type} costs ${describe(COSTS[type]!)}.`);
  }
  return null;
}
