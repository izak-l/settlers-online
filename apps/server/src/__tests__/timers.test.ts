import { describe, expect, it } from "vitest";
import type { Decision, GameEvent, GameState } from "@settlers/engine";
import { clockKey, GameClock } from "../timers";

/** Just the fields the clocks read. */
function state(turn: number, top: Partial<Decision> & { pendingFrom: string[] }, depth = 2) {
  const decision: Decision = { kind: "X", actors: [], allowed: [], module: "base", ...top };
  return {
    turn: { number: turn, activePlayer: "p0" },
    decisions: [...Array.from({ length: depth - 1 }, () => decision), decision],
  } as unknown as GameState;
}
const ev = (type: string): GameEvent => ({ type, text: type });

describe("clockKey", () => {
  it("times the turn per turn number and waited-on player, and side clocks separately", () => {
    expect(clockKey(state(0, { pendingFrom: ["p2"] }))).toEqual({ kind: "turn", key: "turn:0:p2" });
    expect(clockKey(state(4, { pendingFrom: ["p1", "p3"] }))).toEqual({
      kind: "turn",
      key: "turn:4:p1",
    });
    expect(clockKey(state(4, { pendingFrom: ["p1"], timer: "short" }, 3))).toEqual({
      kind: "short",
      key: "short:4:3",
    });
    expect(clockKey(state(4, { pendingFrom: ["p1"], timer: "roll" }))!.key).toBe("roll:4:p1");
    expect(clockKey(state(4, { pendingFrom: ["p1"], timer: "robber" }, 3))!.key).toBe("robber:4:3");
  });

  it("gives each setup round its own clock, so a snake double gets fresh time (#31)", () => {
    const round = (r: number) =>
      clockKey(state(0, { pendingFrom: ["p3"], timer: "setup", data: { round: r } }))!.key;
    expect(round(1)).toBe("setup:1:p3");
    expect(round(2)).not.toBe(round(1));
  });

  it("is null once the game is over", () => {
    expect(clockKey({ ...state(9, { pendingFrom: [] }), winner: "p0" } as GameState)).toBeNull();
    expect(clockKey({ ...state(9, { pendingFrom: [] }), decisions: [] } as GameState)).toBeNull();
  });
});

describe("GameClock", () => {
  const main = state(3, { pendingFrom: ["p0"] });
  const roll = state(3, { pendingFrom: ["p0"], timer: "roll" });
  const discard = state(3, { pendingFrom: ["p1", "p2"], timer: "short" }, 3);
  const robber = state(3, { pendingFrom: ["p0"], timer: "robber" }, 3);
  const setup = state(0, { pendingFrom: ["p0"], timer: "setup", data: { round: 1 } });
  const expire = state(3, { pendingFrom: ["p0"], timer: "expire" }, 3);
  const S = 1000;

  it("keeps one deadline for the whole turn, and restarts for the next player", () => {
    const c = new GameClock(60_000, S);
    expect(c.update(main, 1000)!.deadline).toBe(61_000);
    expect(c.update(main, 20_000)!.deadline).toBe(61_000); // another action, same turn
    expect(c.update(state(4, { pendingFrom: ["p1"] }), 25_000)).toMatchObject({
      kind: "turn",
      deadline: 85_000,
    });
  });

  it("auto-rolls after 5 s, and the turn clock only starts after the roll", () => {
    const c = new GameClock(60_000, S);
    expect(c.update(roll, 0)).toMatchObject({ kind: "roll", deadline: 5_000 });
    expect(c.update(main, 3_000)).toMatchObject({ kind: "turn", deadline: 63_000 });
  });

  it("pauses the turn clock while a discard or the robber runs, then resumes", () => {
    const c = new GameClock(60_000, S);
    c.update(main, 0); // turn ends at 60s
    expect(c.update(discard, 10_000)).toMatchObject({ kind: "short", deadline: 40_000 });
    expect(c.update(discard, 15_000)!.deadline).toBe(40_000); // one player discarded
    expect(c.update(robber, 20_000)).toMatchObject({ kind: "robber", deadline: 50_000 });
    // 50s left on the turn when the discard started.
    expect(c.update(main, 22_000)).toMatchObject({ kind: "turn", deadline: 72_000 });
  });

  it("gives setup 90 s per round, whatever the turn timer", () => {
    expect(new GameClock(30_000, S).update(setup, 0)).toMatchObject({
      kind: "setup",
      deadline: 90_000,
    });
  });

  it("without a turn timer: only the auto-roll and expiring offers run", () => {
    const c = new GameClock(null, S);
    expect(c.update(setup, 0)).toBeNull();
    expect(c.update(roll, 0)).toMatchObject({ kind: "roll", deadline: 5_000 });
    // A Knight before rolling: no robber clock, and the roll clock waits.
    expect(c.update(robber, 2_000)).toBeNull();
    expect(c.update(roll, 60_000)).toMatchObject({ kind: "roll", deadline: 63_000 });
    expect(c.update(main, 61_000)).toBeNull();
    expect(c.update(expire, 70_000)).toMatchObject({ kind: "expire", deadline: 73_000 });
  });

  it("adds 10 s for offers and trades, at most 60 s a turn", () => {
    const c = new GameClock(60_000, S);
    c.update(main, 0);
    c.bonus([ev("OFFERED_TRADE")]);
    expect(c.update(main, 1_000)).toMatchObject({ deadline: 70_000, totalMs: 70_000 });
    for (let i = 0; i < 10; i++) c.bonus([ev("TRADED")]);
    expect(c.update(main, 2_000)!.deadline).toBe(120_000);
    c.bonus([ev("RESPONDED_TRADE"), ev("BANK_TRADE")]);
    expect(c.update(main, 3_000)!.deadline).toBe(120_000);
    // The next turn starts its own allowance.
    const next = state(4, { pendingFrom: ["p1"] });
    c.update(next, 4_000);
    c.bonus([ev("OFFERED_TRADE")]);
    expect(c.update(next, 5_000)!.deadline).toBe(74_000);
  });

  it("adds 15 s for a development card: to the roll clock before rolling, even untimed", () => {
    const c = new GameClock(null, S);
    c.update(roll, 0);
    c.bonus([ev("PLAYED_DEV_CARD")]);
    c.update(robber, 1_000); // the Knight's robber move pauses it with 19 s left
    expect(c.update(roll, 30_000)).toMatchObject({ kind: "roll", deadline: 49_000 });
    const t = new GameClock(60_000, S);
    t.update(main, 0);
    t.bonus([ev("PLAYED_DEV_CARD")]);
    expect(t.update(main, 1_000)!.deadline).toBe(75_000);
  });

  it("starts from full after a reset (everyone left and someone came back)", () => {
    const c = new GameClock(60_000, S);
    c.update(main, 0);
    c.reset();
    expect(c.update(main, 50_000)!.deadline).toBe(110_000);
  });
});
