import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalGame } from "../game/LocalGame";
import { TurnWarning, warningClock } from "./turnWarning";
import { playTurnWarning } from "./player";

const stop = vi.hoisted(() => vi.fn());
vi.mock("./player", () => ({ playTurnWarning: vi.fn(() => stop) }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(100_000);
  vi.clearAllMocks();
});
afterEach(() => vi.useRealTimers());

describe("turn warning", () => {
  it("starts at five seconds, survives ordinary snapshots and stops at expiry", () => {
    const warning = new TurnWarning();
    warning.update({ key: "p0:1", deadline: 130_000 });
    vi.advanceTimersByTime(24_999);
    expect(playTurnWarning).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(playTurnWarning).toHaveBeenCalledOnce();
    expect(playTurnWarning).toHaveBeenCalledWith(130_000);
    warning.update({ key: "p0:1", deadline: 130_030 });
    expect(stop).not.toHaveBeenCalled();
    expect(playTurnWarning).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(5000);
    expect(stop).toHaveBeenCalledOnce();
  });

  it("cancels when ending early, pausing, switching seats or leaving", () => {
    const warning = new TurnWarning();
    warning.update({ key: "p0:1", deadline: 104_000 });
    expect(playTurnWarning).toHaveBeenCalledWith(104_000);
    warning.update(null);
    expect(stop).toHaveBeenCalledOnce();
    warning.update({ key: "p0:1", deadline: 120_000 });
    warning.update({ key: "p1:2", deadline: 130_000 });
    vi.advanceTimersByTime(15_000);
    expect(playTurnWarning).toHaveBeenCalledOnce();
    warning.dispose();
    vi.advanceTimersByTime(30_000);
    expect(playTurnWarning).toHaveBeenCalledOnce();
  });

  it("reschedules corrected deadlines and supports a late join or resume", () => {
    const warning = new TurnWarning();
    warning.update({ key: "p0:1", deadline: 130_000 });
    warning.update({ key: "p0:1", deadline: 110_000 });
    vi.advanceTimersByTime(5000);
    expect(playTurnWarning).toHaveBeenCalledOnce();
    expect(playTurnWarning).toHaveBeenCalledWith(110_000);
    warning.update(null);
    warning.update({ key: "p0:1", deadline: 108_000 });
    expect(playTurnWarning).toHaveBeenLastCalledWith(108_000);
    warning.dispose();
    warning.update({ key: "p0:1", deadline: Date.now() });
    expect(playTurnWarning).toHaveBeenCalledTimes(2);
  });

  it("only warns the clock owner; no spectators, discard clocks, untimed or finished games", () => {
    const snap = new LocalGame(["A", "B"], "warning-test").snapshot();
    expect(warningClock(snap)).toBeNull();
    snap.clock = { kind: "turn", deadline: 130_000, totalMs: 30_000 };
    expect(warningClock(snap)?.deadline).toBe(130_000);
    snap.clock.kind = "short";
    expect(warningClock(snap)).toBeNull();
    snap.clock.kind = "turn";
    snap.seat = "p1";
    expect(warningClock(snap)).toBeNull();
    snap.seat = "spectator";
    expect(warningClock(snap)).toBeNull();
    snap.seat = "p0";
    snap.view.winner = "p0";
    expect(warningClock(snap)).toBeNull();
  });
});
