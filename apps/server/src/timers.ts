import type { GameEvent, GameState } from "@settlers/engine";

/**
 * The clocks a game runs (spec 231). Two main clocks belong to the player whose turn it is:
 * "roll" (the auto-roll countdown) and "turn". Side clocks interrupt them and pause whichever
 * main clock was running: "short" (discards), "robber" (moving it and stealing), "setup" (one
 * setup placement round) and "expire" (an offer everyone else declined).
 */
export type ClockKind = "turn" | "roll" | "short" | "robber" | "setup" | "expire";

/** Seconds on each clock that doesn't follow the lobby's turn timer. */
export const CLOCK_SECONDS = { roll: 5, short: 30, robber: 30, setup: 90, expire: 3 } as const;
/** Kept for the lobby's discard text: the short (discard) clock. */
export const SHORT_SECONDS = CLOCK_SECONDS.short;
/** Turn timer choices offered in the lobby; 0 means off. */
export const TURN_SECONDS = [0, 30, 60, 90, 120] as const;
/** A timeout plays at most this many default actions (a safety net; a turn needs only a few). */
export const MAX_TIMEOUT_ACTIONS = 50;
/** Time added for trading (making an offer, completing a trade), and the most per turn. */
export const TRADE_BONUS_SECONDS = 10;
export const TRADE_BONUS_CAP_SECONDS = 60;
/** Time added for playing a development card, to the roll or turn clock. */
export const DEV_CARD_BONUS_SECONDS = 15;

/** Clocks that run in every game; the rest only when the lobby set a turn timer. */
const ALWAYS: readonly ClockKind[] = ["roll", "expire"];
const isMain = (kind: ClockKind) => kind === "turn" || kind === "roll";

/**
 * Which clock applies now, and what it's timing. The engine marks decisions with their clock
 * (`Decision.timer`); the server never looks at decision kinds. A key changes when a new period
 * starts: the turn per turn number and player, the roll per turn, a setup clock per round and
 * player, the others per stack depth.
 */
export function clockKey(state: GameState): { kind: ClockKind; key: string } | null {
  const top = state.decisions.at(-1);
  if (!top || state.winner !== undefined) return null;
  const turn = state.turn.number;
  const who = top.pendingFrom[0] ?? "";
  const depth = state.decisions.length;
  switch (top.timer) {
    case "roll":
      return { kind: "roll", key: `roll:${turn}:${who}` };
    case "setup":
      return { kind: "setup", key: `setup:${String(top.data?.["round"] ?? 0)}:${who}` };
    case "short":
    case "robber":
    case "expire":
      return { kind: top.timer, key: `${top.timer}:${turn}:${depth}` };
    default:
      return { kind: "turn", key: `turn:${turn}:${who}` };
  }
}

export interface RunningClock {
  kind: ClockKind;
  key: string;
  /** Epoch ms (server time). */
  deadline: number;
  totalMs: number;
}

interface MainClock {
  kind: ClockKind;
  key: string;
  deadline: number;
  totalMs: number;
  /** Set while a side clock runs: the time this clock had left. */
  pausedLeft: number | null;
}

/**
 * One game's clocks. Pure apart from the `now` it's given. `turnMs` is null for games without a
 * turn timer: they still auto-roll and withdraw declined offers.
 */
export class GameClock {
  private main: MainClock | null = null;
  private side: RunningClock | null = null;
  /** Trade time added so far, per turn clock key. */
  private tradeBonus = { key: "", ms: 0 };

  constructor(
    private turnMs: number | null,
    private secondMs: number,
  ) {}

  private duration(kind: ClockKind): number | null {
    if (kind === "turn") return this.turnMs;
    if (this.turnMs === null && !ALWAYS.includes(kind)) return null;
    return CLOCK_SECONDS[kind] * this.secondMs;
  }

  /** Call after every change to the game. Returns the clock that is now running, if any. */
  update(state: GameState, now: number): RunningClock | null {
    const k = clockKey(state);
    if (!k) {
      this.reset();
      return null;
    }
    const ms = this.duration(k.kind);
    if (!isMain(k.kind)) {
      if (this.main && this.main.pausedLeft === null)
        this.main.pausedLeft = Math.max(0, this.main.deadline - now);
      if (ms === null) {
        this.side = null;
        return null;
      }
      if (this.side?.key !== k.key) {
        this.side = { kind: k.kind, key: k.key, deadline: now + ms, totalMs: ms };
      }
      return this.side;
    }
    this.side = null;
    if (ms === null) {
      this.main = null;
      return null;
    }
    if (this.main?.key !== k.key) {
      this.main = { kind: k.kind, key: k.key, deadline: now + ms, totalMs: ms, pausedLeft: null };
    } else if (this.main.pausedLeft !== null) {
      this.main = { ...this.main, deadline: now + this.main.pausedLeft, pausedLeft: null };
    }
    const { pausedLeft: _, ...running } = this.main;
    return running;
  }

  /**
   * Add time for what just happened (spec 231): 10 s on the turn clock for an offer or a
   * completed trade (at most 60 s per turn), 15 s on the roll or turn clock for a development
   * card. Call before `update`, with the events of the action just applied.
   */
  bonus(events: GameEvent[]): void {
    for (const e of events) {
      if (!this.main) return;
      if (e.type === "PLAYED_DEV_CARD") this.extend(DEV_CARD_BONUS_SECONDS * this.secondMs);
      if ((e.type === "OFFERED_TRADE" || e.type === "TRADED") && this.main.kind === "turn") {
        if (this.tradeBonus.key !== this.main.key) this.tradeBonus = { key: this.main.key, ms: 0 };
        const cap = TRADE_BONUS_CAP_SECONDS * this.secondMs;
        const add = Math.min(TRADE_BONUS_SECONDS * this.secondMs, cap - this.tradeBonus.ms);
        if (add > 0) {
          this.tradeBonus.ms += add;
          this.extend(add);
        }
      }
    }
  }

  private extend(ms: number): void {
    const m = this.main!;
    if (m.pausedLeft !== null) m.pausedLeft += ms;
    else m.deadline += ms;
    m.totalMs += ms;
  }

  /** Forget everything; the next `update` starts from full time. */
  reset(): void {
    this.main = null;
    this.side = null;
  }
}
