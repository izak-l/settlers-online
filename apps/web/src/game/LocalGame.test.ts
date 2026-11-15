import { describe, it, expect } from "vitest";
import type { Action } from "@settlers/engine";
import { LocalGame, type Snapshot } from "./LocalGame";

const SEATS = ["p0", "p1", "p2", "p3"];

/** A player who prefers building, otherwise rolls / ends the turn / takes the first option. */
function choose(snap: Snapshot): Action {
  const build = snap.legal.find((a) => a.type.startsWith("BUILD_"));
  return build ?? snap.legal.find((a) => a.type === "END_TURN") ?? snap.legal[0]!;
}

describe("LocalGame", () => {
  it("plays setup plus 20 turns using only what the snapshot offers", () => {
    const game = new LocalGame(SEATS, "local-test");
    let snap = game.snapshot();
    for (let i = 0; i < 2000 && snap.view.turn.number <= 20; i++) {
      expect(snap.legal.length).toBeGreaterThan(0);
      expect(game.send(choose(snap))).toBeNull();
      snap = game.snapshot();
    }
    expect(snap.view.turn.number).toBe(21);
    expect(Object.values(snap.scores).reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(8);
  });

  it("only shows the waiting seat its own hand", () => {
    const game = new LocalGame(SEATS, "redaction");
    for (let i = 0; i < 60; i++) {
      const snap = game.snapshot();
      for (const p of SEATS) {
        const zone = snap.view.zones[`hand-${p}`]!;
        if (p === snap.seat) expect(zone.contents).toBeDefined();
        else expect(zone.contents).toBeUndefined();
      }
      game.send(choose(snap));
    }
  });

  it("returns the rejection for an illegal move and keeps the state", () => {
    const game = new LocalGame(SEATS, "reject");
    const before = game.snapshot();
    const res = game.send({ type: "END_TURN" });
    expect(res?.code).toBe("WRONG_DECISION");
    expect(game.snapshot().view).toEqual(before.view);
  });

  it("the same seed gives the same board", () => {
    const a = new LocalGame(SEATS, "same").snapshot().view.map;
    const b = new LocalGame(SEATS, "same").snapshot().view.map;
    expect(a).toEqual(b);
  });
});
