import type { Snapshot } from "../game/LocalGame";
import { playTurnWarning } from "./player";

export interface WarningClock {
  key: string;
  deadline: number;
}

export function warningClock(snap: Snapshot | null): WarningClock | null {
  if (!snap || snap.seat === "spectator" || snap.view.winner !== undefined) return null;
  const owner = snap.view.decisions.at(-1)?.pendingFrom[0];
  if (snap.clock?.kind !== "turn" || owner !== snap.seat) return null;
  return { key: `${snap.seat}:${snap.view.turn.number}`, deadline: snap.clock.deadline };
}

/** Tracks one running turn across snapshots without restarting its tick on every action. */
export class TurnWarning {
  private clock: WarningClock | null = null;
  private startTimer: ReturnType<typeof setTimeout> | undefined;
  private endTimer: ReturnType<typeof setTimeout> | undefined;
  private stop: (() => void) | undefined;

  update(clock: WarningClock | null): void {
    if (
      clock &&
      this.clock?.key === clock.key &&
      Math.abs(this.clock.deadline - clock.deadline) < 100
    )
      return;
    this.dispose();
    this.clock = clock;
    if (!clock || clock.deadline <= Date.now()) return;
    const start = () => {
      if (clock.deadline <= Date.now()) return;
      this.stop = playTurnWarning(clock.deadline);
      this.endTimer = setTimeout(() => this.dispose(), clock.deadline - Date.now());
    };
    const delay = clock.deadline - Date.now() - 5000;
    if (delay <= 0) start();
    else this.startTimer = setTimeout(start, delay);
  }

  dispose(): void {
    clearTimeout(this.startTimer);
    clearTimeout(this.endTimer);
    this.stop?.();
    this.stop = undefined;
    this.clock = null;
  }
}
