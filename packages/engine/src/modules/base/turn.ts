import { nextInt } from "../../rng";
import { runProduce, runRollDice, type ActionHandlers } from "../../module";
import type { GameState } from "../../types";
import { mainDecision, rollDecision } from "./helpers";

/** Two six-sided dice. */
export function rollTwoDice(draft: GameState): Record<string, number> {
  const red = nextInt(draft.rng, 6);
  const yellow = nextInt(red.rng, 6);
  draft.rng = yellow.rng;
  return { red: red.value + 1, yellow: yellow.value + 1 };
}

export const turnActions: ActionHandlers = {
  ROLL: {
    validate: () => null,
    apply(draft, player, _action, { events, modules }) {
      const dice = runRollDice(modules, draft);
      const total = Object.values(dice).reduce((a, b) => a + b, 0);
      draft.moduleState["base"] = { ...(draft.moduleState["base"] as object), lastRoll: dice };
      events.push({ type: "ROLLED", text: `${player} rolled ${total}`, data: { dice, total } });
      // A 7 produces nothing. Discards, robber and stealing arrive in M5.
      if (total !== 7) runProduce(modules, draft, total, events);
      draft.decisions.pop();
      draft.decisions.push(mainDecision(player));
    },
    candidates: () => [{ type: "ROLL" }],
  },

  END_TURN: {
    validate: () => null,
    apply(draft, player, _action, { events }) {
      const next = draft.players[(draft.players.indexOf(player) + 1) % draft.players.length]!;
      draft.decisions.pop();
      draft.turn = { number: draft.turn.number + 1, activePlayer: next };
      draft.decisions.push(rollDecision(next));
      events.push({ type: "TURN_ENDED", text: `${player} ended their turn` });
    },
    candidates: () => [{ type: "END_TURN" }],
  },
};
