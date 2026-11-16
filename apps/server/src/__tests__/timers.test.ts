import { describe, expect, it } from "vitest";
import type { Decision, GameState } from "@settlers/engine";
import { clockKey, TurnClock } from "../timers";

/** Just the fields the clocks read. */
function state(turn: number, top: Partial<Decision> & { pendingFrom: string[] }, depth = 2) {
  const decision: Decision = { kind: "X", actors: [], allowed: [], module: "base", ...top };
  return {
    turn: { number: turn, activePlayer: "p0" },
    decisions: [...Array.from({ length: depth - 1 }, () => decision), decision],
  } as unknown as GameState;
}

describe("clockKey", () => {
  it("times the turn per turn number and waited-on player, and short decisions separately", () => {
    expect(clockKey(state(0, { pendingFrom: ["p2"] }))).toEqual({ kind: "turn", key: "turn:0:p2" });
    expect(clockKey(state(4, { pendingFrom: ["p1", "p3"] }))).toEqual({
      kind: "turn",
      key: "turn:4:p1",
    });
    expect(clockKey(state(4, { pendingFrom: ["p1"], timer: "short" }, 3))).toEqual({
      kind: "short",
      key: "short:4:3",
    });
  });

  it("is null once the game is over", () => {
    expect(clockKey({ ...state(9, { pendingFrom: [] }), winner: "p0" } as GameState)).toBeNull();
    expect(clockKey({ ...state(9, { pendingFrom: [] }), decisions: [] } as GameState)).toBeNull();
  });
});

describe("TurnClock", () => {
  const main = state(3, { pendingFrom: ["p0"] });
  const discard = state(3, { pendingFrom: ["p1", "p2"], timer: "short" }, 3);

  it("keeps one deadline for the whole turn, and restarts for the next player", () => {
    const c = new TurnClock(60_000, 30_000);
    expect(c.update(main, 1000)!.deadline).toBe(61_000);
    expect(c.update(main, 20_000)!.deadline).toBe(61_000); // another action, same turn
    expect(c.update(state(4, { pendingFrom: ["p1"] }), 25_000)).toMatchObject({
      kind: "turn",
      deadline: 85_000,
    });
  });

  it("pauses the turn clock while a discard runs, then resumes with the time left", () => {
    const c = new TurnClock(60_000, 30_000);
    c.update(main, 0); // turn ends at 60s
    expect(c.update(discard, 10_000)).toMatchObject({ kind: "short", deadline: 40_000 });
    expect(c.update(discard, 15_000)!.deadline).toBe(40_000); // one player discarded
    // 50s left on the turn when the discard started.
    expect(c.update(main, 22_000)).toMatchObject({ kind: "turn", deadline: 72_000 });
  });

  it("starts from full after a reset (everyone left and someone came back)", () => {
    const c = new TurnClock(60_000, 30_000);
    c.update(main, 0);
    c.reset();
    expect(c.update(main, 50_000)!.deadline).toBe(110_000);
  });
});
