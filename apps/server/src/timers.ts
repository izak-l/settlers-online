import type { GameState } from "@settlers/engine";

export type ClockKind = "turn" | "short";

/** Seconds on the short clock (discards). */
export const SHORT_SECONDS = 30;
/** Turn timer choices offered in the lobby; 0 means off. */
export const TURN_SECONDS = [0, 30, 60, 90, 120] as const;
/** A timeout plays at most this many default actions (a safety net; a turn needs only a few). */
export const MAX_TIMEOUT_ACTIONS = 50;

/**
 * Which clock runs now, and what it's timing. The turn clock restarts when the turn number or the
 * player being waited on changes; the short clock restarts for each new short decision.
 * The engine marks short decisions (`Decision.timer`); the server never looks at decision kinds.
 */
export function clockKey(state: GameState): { kind: ClockKind; key: string } | null {
  const top = state.decisions.at(-1);
  if (!top || state.winner !== undefined) return null;
  if (top.timer === "short")
    return { kind: "short", key: `short:${state.turn.number}:${state.decisions.length}` };
  return { kind: "turn", key: `turn:${state.turn.number}:${top.pendingFrom[0] ?? ""}` };
}

export interface RunningClock {
  kind: ClockKind;
  key: string;
  /** Epoch ms (server time). */
  deadline: number;
  totalMs: number;
}

/**
 * One game's clocks. Pure apart from the `now` it's given. While a short clock runs, the turn
 * clock is paused and later resumes with the time it had left.
 */
export class TurnClock {
  private turn: { key: string; deadline: number; pausedLeft: number | null } | null = null;
  private short: { key: string; deadline: number } | null = null;

  constructor(
    private turnMs: number,
    private shortMs: number,
  ) {}

  /** Call after every change to the game. Returns the clock that is now running, if any. */
  update(state: GameState, now: number): RunningClock | null {
    const k = clockKey(state);
    if (!k) {
      this.reset();
      return null;
    }
    if (k.kind === "short") {
      if (this.turn && this.turn.pausedLeft === null)
        this.turn.pausedLeft = Math.max(0, this.turn.deadline - now);
      if (this.short?.key !== k.key) this.short = { key: k.key, deadline: now + this.shortMs };
      return { kind: "short", key: k.key, deadline: this.short.deadline, totalMs: this.shortMs };
    }
    this.short = null;
    if (this.turn?.key !== k.key) {
      this.turn = { key: k.key, deadline: now + this.turnMs, pausedLeft: null };
    } else if (this.turn.pausedLeft !== null) {
      this.turn = { ...this.turn, deadline: now + this.turn.pausedLeft, pausedLeft: null };
    }
    return { kind: "turn", key: k.key, deadline: this.turn.deadline, totalMs: this.turnMs };
  }

  /** Forget everything; the next `update` starts from full time. */
  reset(): void {
    this.turn = null;
    this.short = null;
  }
}
