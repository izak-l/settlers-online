import type { EdgeId, VertexId } from "../../board/graph";
import { reject, runCanMove, runCanPlace, runOnPlace, type ActionHandlers } from "../../module";
import type { GameState, Piece, PlayerId, Rejection } from "../../types";
import { updateAwards } from "../base/awards";
import { takeFreePlacement } from "../base/devcards";
import {
  addPiece,
  buildingAt,
  canAfford,
  countOwned,
  describe,
  edgePieceAt,
  pay,
  terrainAt,
} from "../base/helpers";
import { finishSetupRoad, setupEdgeOk } from "../base/setup";
import { SHIP_COST, SHIP_LIMIT, WATER } from "./data";
import { seaState } from "./scenario";

// ---------------------------------------------------------------------------
// Where ships may go
// ---------------------------------------------------------------------------

/** The pirate's hex, or undefined when there is no pirate or it's parked on the frame. */
export function pirateHex(state: GameState): string | undefined {
  const pirate = state.pieces["pirate"];
  return pirate && "hex" in pirate.at ? pirate.at.hex : undefined;
}

/** An edge a ship can use: water on one side (sea or unrevealed fog), or the map's outer border. */
export function isShipEdge(state: GameState, edge: EdgeId): boolean {
  const e = state.graph.edges.get(edge);
  if (!e) return false;
  if (e.hexes.length < 2) return true; // along the frame
  return e.hexes.some((h) => WATER.has(terrainAt(state, h) ?? "sea"));
}

/** One of the six edges of the pirate's hex: no ship may be built, placed or moved there. */
export function nextToPirate(state: GameState, edge: EdgeId): boolean {
  const hex = pirateHex(state);
  return hex !== undefined && (state.graph.edges.get(edge)?.hexes.includes(hex) ?? false);
}

const isOwnShip = (piece: Piece | undefined, player: PlayerId, ignore?: EdgeId): boolean =>
  piece?.type === "ship" &&
  piece.owner === player &&
  !("edge" in piece.at && piece.at.edge === ignore);

/**
 * A ship connects at a corner with the player's own building, or with one of their other ships
 * where no opponent's building stands. Never directly to a road. `ignore` is a ship being moved.
 */
function shipConnects(state: GameState, player: PlayerId, edge: EdgeId, ignore?: EdgeId): boolean {
  for (const vertex of state.graph.edges.get(edge)!.vertices) {
    const building = buildingAt(state, vertex);
    if (building?.owner === player) return true;
    if (building) continue;
    const edges = state.graph.vertices.get(vertex)!.edges;
    if (edges.some((e) => e !== edge && isOwnShip(edgePieceAt(state, e), player, ignore)))
      return true;
  }
  return false;
}

/** Why a ship can't go on `edge` (ignoring a ship being moved from `ignore`), or null if it can. */
export function shipSpotProblem(
  state: GameState,
  player: PlayerId,
  edge: EdgeId,
  ignore?: EdgeId,
): Rejection | null {
  const occupant = edgePieceAt(state, edge);
  if (!state.graph.edges.has(edge) || !isShipEdge(state, edge) || occupant) {
    return reject("ILLEGAL_PLACEMENT", "Ships go on a free edge next to the sea.");
  }
  if (nextToPirate(state, edge)) {
    return reject("ILLEGAL_PLACEMENT", "The pirate blocks ships next to its hex.");
  }
  if (!shipConnects(state, player, edge, ignore)) {
    return reject("ILLEGAL_PLACEMENT", "Ships must connect to your own ship or building.");
  }
  return null;
}

/**
 * Edges worth checking for a new ship: those at a corner with one of the player's buildings or
 * ships (a ship can only connect there). Keeps legalActions fast on big maps.
 */
function edgesNearOwn(state: GameState, player: PlayerId): EdgeId[] {
  const corners = new Set<VertexId>();
  for (const piece of Object.values(state.pieces)) {
    if (piece.owner !== player) continue;
    if ("vertex" in piece.at) corners.add(piece.at.vertex);
    if ("edge" in piece.at && piece.type === "ship")
      for (const v of state.graph.edges.get(piece.at.edge)?.vertices ?? []) corners.add(v);
  }
  const out = new Set<EdgeId>();
  for (const v of corners) for (const e of state.graph.vertices.get(v)?.edges ?? []) out.add(e);
  return [...out].sort();
}

function checkShipLimit(state: GameState, player: PlayerId): Rejection | null {
  return countOwned(state, player, "ship") >= SHIP_LIMIT
    ? reject("PIECE_LIMIT", "You have no ships left.")
    : null;
}

/** Place a ship, remember the turn it was built, and tell every module. */
function placeShip(draft: GameState, player: PlayerId, edge: EdgeId): Piece {
  const piece = addPiece(draft, "ship", player, { edge });
  seaState(draft).shipBuiltOn[piece.id] = draft.turn.number;
  return piece;
}

// ---------------------------------------------------------------------------
// Moving ships
// ---------------------------------------------------------------------------

/**
 * The ship has an open end: a corner with none of the player's buildings or other ships. (A ship
 * in a line joining two of their buildings never has one, even if an opponent has since built on
 * the line, so that rule needs no separate check.)
 */
function hasOpenEnd(state: GameState, player: PlayerId, edge: EdgeId): boolean {
  return state.graph.edges.get(edge)!.vertices.some((vertex) => {
    if (buildingAt(state, vertex)?.owner === player) return false;
    const edges = state.graph.vertices.get(vertex)!.edges;
    return !edges.some((e) => e !== edge && isOwnShip(edgePieceAt(state, e), player));
  });
}

/** Why the ship on `from` can't move this turn, or null if it can. */
export function moveProblem(state: GameState, player: PlayerId, from: EdgeId): Rejection | null {
  const piece = edgePieceAt(state, from);
  if (!isOwnShip(piece, player)) return reject("INVALID_CHOICE", "Pick one of your ships.");
  const sea = seaState(state);
  if (sea.movedOnTurn === state.turn.number) {
    return reject("INVALID_CHOICE", "You've already moved a ship this turn.");
  }
  if (sea.shipBuiltOn[piece!.id] === state.turn.number) {
    return reject("INVALID_CHOICE", "Ships can't move on the turn they're built.");
  }
  if (nextToPirate(state, from)) {
    return reject("INVALID_CHOICE", "The pirate blocks ships next to its hex.");
  }
  if (!hasOpenEnd(state, player, from)) {
    return reject("INVALID_CHOICE", "Only the open end of a line of ships can move.");
  }
  return null;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export const shipActions: ActionHandlers = {
  BUILD_SHIP: {
    build: { piece: "ship", label: "Ship", cost: SHIP_COST },
    // Placement first, then limit and cost, so CANNOT_AFFORD means a valid spot (map previews).
    validate(state, player, { edge }, { modules }) {
      return (
        shipSpotProblem(state, player, edge) ??
        runCanPlace(modules, state, player, "ship", { edge }, "MAIN") ??
        checkShipLimit(state, player) ??
        (canAfford(state, player, SHIP_COST)
          ? null
          : reject("CANNOT_AFFORD", `A ship costs ${describe(SHIP_COST)}.`))
      );
    },
    apply(draft, player, { edge }, ctx) {
      pay(draft, player, SHIP_COST);
      const piece = placeShip(draft, player, edge);
      ctx.events.push({ type: "BUILT_SHIP", text: `${player} built a ship` });
      runOnPlace(ctx.modules, draft, piece, ctx);
      updateAwards(draft, ctx.events, ctx.modules);
    },
    candidates: (s, p) => edgesNearOwn(s, p).map((edge) => ({ type: "BUILD_SHIP", edge })),
  },

  /** In setup, instead of the road: a ship on a sea edge next to the settlement just placed. */
  PLACE_SHIP: {
    validate(state, player, { edge }, { modules }) {
      if (!setupEdgeOk(state, edge) || !isShipEdge(state, edge)) {
        return reject(
          "ILLEGAL_PLACEMENT",
          "Your ship must go on a sea edge next to the settlement you just placed.",
        );
      }
      if (nextToPirate(state, edge)) {
        return reject("ILLEGAL_PLACEMENT", "The pirate blocks ships next to its hex.");
      }
      return runCanPlace(modules, state, player, "ship", { edge }, "PLACE_ROAD");
    },
    apply(draft, player, { edge }, ctx) {
      const piece = placeShip(draft, player, edge);
      ctx.events.push({ type: "PLACED_SHIP", text: `${player} placed a ship` });
      finishSetupRoad(draft, ctx, piece);
    },
    candidates: (s, p) => edgesNearOwn(s, p).map((edge) => ({ type: "PLACE_SHIP", edge })),
  },

  /** Road Crew: either free piece may be a ship. */
  PLACE_FREE_SHIP: {
    validate(state, player, { edge }, { modules }) {
      const fail = checkShipLimit(state, player) ?? shipSpotProblem(state, player, edge);
      return fail ?? runCanPlace(modules, state, player, "ship", { edge }, "PLACE_FREE_ROAD");
    },
    apply(draft, player, { edge }, ctx) {
      const piece = placeShip(draft, player, edge);
      ctx.events.push({ type: "BUILT_SHIP", text: `${player} built a free ship` });
      updateAwards(draft, ctx.events, ctx.modules);
      takeFreePlacement(draft, player, ctx.modules);
      runOnPlace(ctx.modules, draft, piece, ctx);
    },
    candidates: (s, p) => edgesNearOwn(s, p).map((edge) => ({ type: "PLACE_FREE_SHIP", edge })),
  },

  MOVE_SHIP: {
    validate(state, player, { from, to }, { modules }) {
      const fail = moveProblem(state, player, from);
      if (fail) return fail;
      if (to === from) return reject("ILLEGAL_PLACEMENT", "Move the ship to a different edge.");
      return (
        shipSpotProblem(state, player, to, from) ??
        runCanPlace(modules, state, player, "ship", { edge: to }, "MAIN") ??
        runCanMove(modules, state, player, edgePieceAt(state, from)!, { edge: to })
      );
    },
    apply(draft, player, { from, to }, ctx) {
      const piece = edgePieceAt(draft, from)!;
      piece.at = { edge: to };
      seaState(draft).movedOnTurn = draft.turn.number;
      ctx.events.push({ type: "MOVED_SHIP", text: `${player} moved a ship`, data: { from, to } });
      runOnPlace(ctx.modules, draft, piece, ctx);
      updateAwards(draft, ctx.events, ctx.modules);
    },
    candidates(state, player) {
      const out: { type: "MOVE_SHIP"; from: EdgeId; to: EdgeId }[] = [];
      for (const piece of Object.values(state.pieces)) {
        if (piece.type !== "ship" || piece.owner !== player || !("edge" in piece.at)) continue;
        const from = piece.at.edge;
        if (moveProblem(state, player, from)) continue;
        for (const to of edgesNearOwn(state, player)) out.push({ type: "MOVE_SHIP", from, to });
      }
      return out;
    },
  },
};
