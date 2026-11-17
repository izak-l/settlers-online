import type { HexKey } from "../../board/graph";
import { reject, runCanPlace, runOnPlace, type ActionHandlers } from "../../module";
import type { GameState, PlayerId } from "../../types";
import { edgePieceAt, popDecision, terrainAt } from "../base/helpers";
import { rob } from "../base/robber";
import { pirateHex } from "./ships";
import { seaState } from "./scenario";

/** Players with a ship on an edge of the pirate's hex, other than `thief`, in seat order. */
function shipOwners(state: GameState, hex: HexKey, thief: PlayerId): PlayerId[] {
  const owners = new Set<PlayerId>();
  for (const edge of state.graph.hexEdges.get(hex) ?? []) {
    const piece = edgePieceAt(state, edge);
    if (piece?.type === "ship" && piece.owner && piece.owner !== thief) owners.add(piece.owner);
  }
  return state.players.filter((p) => owners.has(p));
}

export const pirateActions: ActionHandlers = {
  /** Instead of the robber (after a 7 or a Knight): a new sea hex, or off the board (null). */
  MOVE_PIRATE: {
    validate(state, player, { hex }, { modules }) {
      if (!seaState(state).pirateInPlay) {
        return reject("WRONG_DECISION", "There's no pirate in this scenario.");
      }
      if (hex === null) {
        // Off the board is written "frame" (as in the scenario's `pirateStart`) for other modules.
        return pirateHex(state) === undefined
          ? reject("ILLEGAL_PLACEMENT", "The pirate is already off the board.")
          : runCanPlace(modules, state, player, "pirate", { hex: "frame" }, "MOVE_ROBBER");
      }
      if (
        !state.graph.hexKeys.has(hex) ||
        terrainAt(state, hex) !== "sea" ||
        hex === pirateHex(state)
      ) {
        return reject("ILLEGAL_PLACEMENT", "Move the pirate to a different sea hex.");
      }
      return runCanPlace(modules, state, player, "pirate", { hex }, "MOVE_ROBBER");
    },
    apply(draft, player, { hex }, ctx) {
      popDecision(draft); // the robber-or-pirate step
      if (hex === null) {
        delete draft.pieces["pirate"];
        ctx.events.push({
          type: "MOVED_PIRATE",
          text: `${player} sent the pirate away`,
          data: { hex },
        });
        return;
      }
      draft.pieces["pirate"] = { id: "pirate", type: "pirate", at: { hex } };
      ctx.events.push({ type: "MOVED_PIRATE", text: `${player} moved the pirate`, data: { hex } });
      runOnPlace(ctx.modules, draft, draft.pieces["pirate"], ctx);
      rob(draft, player, shipOwners(draft, hex, player), "pirate", ctx);
    },
    candidates: (s) => [
      ...[...s.graph.hexKeys].sort().map((hex) => ({ type: "MOVE_PIRATE" as const, hex })),
      { type: "MOVE_PIRATE" as const, hex: null },
    ],
  },
};
