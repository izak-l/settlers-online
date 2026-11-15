import type { EdgeId, HexKey, VertexId } from "./board/graph";
import type { PlayerId, Resources } from "./types";

/** Every action a client (or the system actor) can send. */
export type Action =
  | { type: "PLACE_SETTLEMENT"; vertex: VertexId }
  | { type: "PLACE_ROAD"; edge: EdgeId }
  | { type: "ROLL" }
  | { type: "BUILD_ROAD"; edge: EdgeId }
  | { type: "BUILD_SETTLEMENT"; vertex: VertexId }
  | { type: "BUILD_CITY"; vertex: VertexId }
  | { type: "END_TURN" }
  | { type: "DISCARD"; resources: Resources }
  | { type: "MOVE_ROBBER"; hex: HexKey }
  | { type: "STEAL"; from: PlayerId };

export type ActionType = Action["type"];

/**
 * A concrete action the player may legally send right now. For actions that need a choice with
 * too many combinations to list (a discard, a trade offer), `legalActions` gives one valid example.
 */
export type ActionSpec = Action;
