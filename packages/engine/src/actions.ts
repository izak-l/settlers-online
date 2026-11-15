import type { EdgeId, VertexId } from "./board/graph";

/** Every action a client (or the system actor) can send. */
export type Action =
  | { type: "PLACE_SETTLEMENT"; vertex: VertexId }
  | { type: "PLACE_ROAD"; edge: EdgeId }
  | { type: "ROLL" }
  | { type: "BUILD_ROAD"; edge: EdgeId }
  | { type: "BUILD_SETTLEMENT"; vertex: VertexId }
  | { type: "BUILD_CITY"; vertex: VertexId }
  | { type: "END_TURN" };

export type ActionType = Action["type"];

/** A concrete action the player may legally send right now. */
export type ActionSpec = Action;
