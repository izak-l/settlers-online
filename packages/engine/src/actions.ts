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
  | { type: "STEAL"; from: PlayerId }
  | { type: "BUY_DEV_CARD" }
  | { type: "PLAY_KNIGHT" }
  | { type: "PLAY_ROAD_BUILDING" }
  | { type: "PLACE_FREE_ROAD"; edge: EdgeId }
  | { type: "PLAY_YEAR_OF_PLENTY"; resources: Resources }
  | { type: "PLAY_MONOPOLY"; resource: string }
  | { type: "BANK_TRADE"; give: string; get: string }
  | { type: "OFFER_TRADE"; give: Resources; want: Resources }
  | { type: "RESPOND_TRADE"; accept: boolean }
  | { type: "CONFIRM_TRADE"; with: PlayerId }
  | { type: "CANCEL_TRADE" }
  // Seafaring (spec 015)
  | { type: "BUILD_SHIP"; edge: EdgeId }
  | { type: "PLACE_SHIP"; edge: EdgeId }
  | { type: "PLACE_FREE_SHIP"; edge: EdgeId }
  | { type: "MOVE_SHIP"; from: EdgeId; to: EdgeId }
  /** A sea hex, or null to park the pirate on the frame (off the board). */
  | { type: "MOVE_PIRATE"; hex: HexKey | null }
  | { type: "CHOOSE_GOLD"; resources: Resources };

export type ActionType = Action["type"];

/**
 * A concrete action the player may legally send right now. For actions that need a choice with
 * too many combinations to list (a discard, a trade offer), `legalActions` gives one valid example.
 */
export type ActionSpec = Action;
