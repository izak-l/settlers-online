import { nextInt } from "../../rng";
import { runOnTurnEnd, runProduce, runRollDice, type ActionHandlers } from "../../module";
import type { GameEvent, GameState, PlayerId } from "../../types";
import { mainDecision, popDecision, rollDecision } from "./helpers";
import { startSevenFlow } from "./robber";
import { endTurnDevCards } from "./devcards";

/** Two six-sided dice. */
export function rollTwoDice(draft: GameState): Record<string, number> {
  const red = nextInt(draft.rng, 6);
  const yellow = nextInt(red.rng, 6);
  draft.rng = yellow.rng;
  return { red: red.value + 1, yellow: yellow.value + 1 };
}

/**
 * The roll-off (spec 231): everyone rolls two dice, tied leaders roll again until one is highest.
 * Logs each roll and returns the winner.
 */
function rollOff(draft: GameState, events: GameEvent[]): PlayerId {
  let contenders = [...draft.players];
  // Ties end with probability 1; the cap only guards against a broken RNG.
  for (let round = 1; round <= 50; round++) {
    const totals = contenders.map((player) => {
      const dice = rollTwoDice(draft);
      const total = Object.values(dice).reduce((a, b) => a + b, 0);
      events.push({
        type: "ROLLED_FOR_ORDER",
        text: `${player} rolled ${total}${round > 1 ? " (roll-off)" : ""}`,
        data: { player, dice, total, round },
      });
      return total;
    });
    const best = Math.max(...totals);
    const leaders = contenders.filter((_, i) => totals[i] === best);
    if (leaders.length === 1) return leaders[0]!;
    events.push({
      type: "TIED_FOR_ORDER",
      text: `${leaders.join(" and ")} tied on ${best} and roll again`,
      data: { players: leaders, total: best },
    });
    contenders = leaders;
  }
  return contenders[0]!;
}

/**
 * Start everything queued so far from `first` instead of the first seat: each queued step's
 * players move round the table by the same offset, so any module's setup order still holds.
 */
function rotateQueue(draft: GameState, first: PlayerId): void {
  const n = draft.players.length;
  const offset = draft.players.indexOf(first);
  const shift = (p: PlayerId) => {
    const i = draft.players.indexOf(p);
    return i < 0 ? p : draft.players[(i + offset) % n]!;
  };
  for (const d of draft.decisions) {
    d.actors = d.actors.map(shift);
    d.pendingFrom = d.pendingFrom.map(shift);
  }
  draft.turn = { ...draft.turn, activePlayer: shift(draft.turn.activePlayer) };
}

export const turnActions: ActionHandlers = {
  ROLL_FOR_ORDER: {
    validate: () => null,
    apply(draft, _player, _action, { events }) {
      popDecision(draft);
      const first = rollOff(draft, events);
      rotateQueue(draft, first);
      events.push({ type: "FIRST_PLAYER", text: `${first} goes first`, data: { player: first } });
    },
    candidates: () => [{ type: "ROLL_FOR_ORDER" }],
  },

  ROLL: {
    validate: () => null,
    apply(draft, player, _action, { events, modules }) {
      const dice = runRollDice(modules, draft);
      const total = Object.values(dice).reduce((a, b) => a + b, 0);
      draft.moduleState["base"] = { ...(draft.moduleState["base"] as object), lastRoll: dice };
      events.push({ type: "ROLLED", text: `${player} rolled ${total}`, data: { dice, total } });
      draft.decisions.pop();
      draft.decisions.push(mainDecision(player));
      // A 7 produces nothing: discards, then the robber, are resolved before the main step.
      if (total === 7) startSevenFlow(draft, player);
      else runProduce(modules, draft, total, events);
    },
    candidates: () => [{ type: "ROLL" }],
  },

  END_TURN: {
    validate: () => null,
    apply(draft, player, _action, ctx) {
      const next = draft.players[(draft.players.indexOf(player) + 1) % draft.players.length]!;
      draft.decisions.pop();
      endTurnDevCards(draft, player);
      draft.turn = { number: draft.turn.number + 1, activePlayer: next };
      draft.decisions.push(rollDecision(next));
      ctx.events.push({ type: "TURN_ENDED", text: `${player} ended their turn` });
      runOnTurnEnd(ctx.modules, draft, player, ctx);
    },
    candidates: () => [{ type: "END_TURN" }],
  },
};
