import type { EdgeId, HexKey, VertexId } from "../../board/graph";
import { reject } from "../../module";
import type { Decision, FeatureId, GameState, Piece, PlayerId, Resources } from "../../types";
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

/** Dev cards can be played before rolling and during the main step. */
export const PLAY_ACTIONS = [
  "PLAY_KNIGHT",
  "PLAY_ROAD_BUILDING",
  "PLAY_YEAR_OF_PLENTY",
  "PLAY_MONOPOLY",
] as const;

export const rollDecision = (p: PlayerId): Decision =>
  decision("ROLL", p, ["ROLL", ...PLAY_ACTIONS]);

export const mainDecision = (p: PlayerId): Decision =>
  decision("MAIN", p, [
    "BUILD_ROAD",
    "BUILD_SETTLEMENT",
    "BUILD_CITY",
    "BUY_DEV_CARD",
    ...PLAY_ACTIONS,
    "BANK_TRADE",
    "OFFER_TRADE",
    "END_TURN",
  ]);

export interface BaseModuleState {
  lastRoll?: Record<string, number>;
  playedDevThisTurn: boolean;
  longestRoad: PlayerId | null;
  largestArmy: PlayerId | null;
}

/** Is this base-game feature on? Games saved before switches existed have none: all on. */
export function featureOn(state: GameState, id: FeatureId): boolean {
  return state.options.features?.[id] !== false;
}

export function baseState(state: GameState): BaseModuleState {
  return state.moduleState["base"] as BaseModuleState;
}

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

/** Whatever sits on an edge (a road, a ship, …): an edge holds one piece. */
export function edgePieceAt(state: GameState, edge: EdgeId): Piece | undefined {
  return Object.values(state.pieces).find((p) => "edge" in p.at && p.at.edge === edge);
}

/** The road on an edge, if the piece there is a road. */
export function roadAt(state: GameState, edge: EdgeId): Piece | undefined {
  const piece = edgePieceAt(state, edge);
  return piece?.type === "road" ? piece : undefined;
}

/**
 * Terrain of a hex, read from the map (so a revealed hex reads its new terrain). Undefined for
 * a hex the map doesn't list.
 */
export function terrainAt(state: GameState, hex: HexKey): string | undefined {
  const i = state.graph.hexIndex.get(hex);
  return i === undefined ? undefined : state.map.hexes[i]?.terrain;
}

/** Land is any listed hex that isn't sea. (Modules with other water terrains say so via canPlace.) */
export function isLandHex(state: GameState, hex: HexKey): boolean {
  const terrain = terrainAt(state, hex);
  return terrain !== undefined && terrain !== "sea";
}

/** A corner touching at least one land hex: where buildings may stand. */
export function isLandVertex(state: GameState, vertex: VertexId): boolean {
  return state.graph.vertices.get(vertex)?.hexes.some((h) => isLandHex(state, h)) ?? false;
}

/** An edge with land on at least one side: where roads may go. */
export function isLandEdge(state: GameState, edge: EdgeId): boolean {
  return state.graph.edges.get(edge)?.hexes.some((h) => isLandHex(state, h)) ?? false;
}

export function countOwned(state: GameState, player: PlayerId, type: string): number {
  return Object.values(state.pieces).filter((p) => p.owner === player && p.type === type).length;
}

/** Vertex touches land, is free, and no neighbouring vertex has a building. */
export function distanceRuleOk(state: GameState, vertex: VertexId): boolean {
  const v = state.graph.vertices.get(vertex);
  if (!v || !isLandVertex(state, vertex) || buildingAt(state, vertex)) return false;
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

/** A road may go here: a land edge that's free and connects to the player's network. */
export function roadSpotOk(state: GameState, player: PlayerId, edge: EdgeId): boolean {
  return (
    state.graph.edges.has(edge) &&
    isLandEdge(state, edge) &&
    !edgePieceAt(state, edge) &&
    roadConnects(state, player, edge)
  );
}

/**
 * The corner touches one of the player's route pieces (`routeTypes`: roads, plus ships with
 * seafaring), so a settlement may be built there after setup.
 */
export function touchesOwnRoute(
  state: GameState,
  player: PlayerId,
  vertex: VertexId,
  routeTypes: readonly string[],
): boolean {
  return state.graph.vertices.get(vertex)!.edges.some((e) => {
    const piece = edgePieceAt(state, e);
    return piece?.owner === player && routeTypes.includes(piece.type);
  });
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

export function addPiece(draft: GameState, type: string, owner: PlayerId, at: Piece["at"]): Piece {
  const id = newPieceId(draft, type, owner);
  draft.pieces[id] = { id, type, owner, at };
  return draft.pieces[id]!;
}

export function handOf(state: GameState, player: PlayerId): Resources {
  return state.zones[`hand-${player}`]!.contents;
}

export function handSize(state: GameState, player: PlayerId): number {
  return Object.values(handOf(state, player)).reduce((a, b) => a + b, 0);
}

/**
 * One entry per card, e.g. { wood: 2, ore: 1 } → ["ore", "wood", "wood"].
 * Sorted by key: anything the RNG picks from must not depend on object key order, which
 * storage doesn't preserve (Postgres jsonb sorts keys).
 */
export function cardList(res: Resources): string[] {
  return Object.keys(res)
    .sort()
    .flatMap((r) => Array<string>(Math.max(0, res[r] ?? 0)).fill(r));
}

export function robberHex(state: GameState): string | undefined {
  const robber = state.pieces["robber"];
  return robber && "hex" in robber.at ? robber.at.hex : undefined;
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
