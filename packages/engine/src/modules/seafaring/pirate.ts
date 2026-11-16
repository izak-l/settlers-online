import type { HexKey } from "../../board/graph";
import { reject, runCanPlace, runOnPlace, type ActionHandlers } from "../../module";
import type { GameState, PlayerId } from "../../types";
import { decision, edgePieceAt, handSize, popDecision, terrainAt } from "../base/helpers";
import { steal } from "../base/robber";
import { pirateHex } from "./ships";
import { seaState } from "./scenario";

/** Players `thief` can rob from the pirate's hex: a ship on one of its edges, and a card in hand. */
function shipVictims(state: GameState, hex: HexKey, thief: PlayerId): PlayerId[] {
  const owners = new Set<PlayerId>();
  for (const edge of state.graph.hexEdges.get(hex) ?? []) {
    const piece = edgePieceAt(state, edge);
    if (piece?.type === "ship" && piece.owner && piece.owner !== thief) owners.add(piece.owner);
  }
  return state.players.filter((p) => owners.has(p) && handSize(state, p) > 0);
}

export const pirateActions: ActionHandlers = {
  /** Instead of the robber (after a 7 or a Knight): a new sea hex, or off the board (null). */
  MOVE_PIRATE: {
    validate(state, player, { hex }, { modules }) {
      if (!seaState(state).pirateInPlay) {
        return reject("WRONG_DECISION", "There's no pirate in this scenario.");
      }
      if (hex === null) {
        return pirateHex(state) === undefined
          ? reject("ILLEGAL_PLACEMENT", "The pirate is already off the board.")
          : null;
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
      const victims = shipVictims(draft, hex, player);
      if (victims.length === 1) steal(draft, player, victims[0]!, ctx.events);
      if (victims.length > 1)
        draft.decisions.push(decision("STEAL", player, ["STEAL"], { victims }));
    },
    candidates: (s) => [
      ...[...s.graph.hexKeys].sort().map((hex) => ({ type: "MOVE_PIRATE" as const, hex })),
      { type: "MOVE_PIRATE" as const, hex: null },
    ],
  },
};
