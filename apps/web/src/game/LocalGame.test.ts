import { describe, it, expect } from "vitest";
import type { Action } from "@settlers/engine";
import { findMap } from "@settlers/maps";
import { LocalGame, type Snapshot } from "./LocalGame";

const NAMES = ["A", "B", "C", "D"];

/** A player who prefers building, otherwise ends the turn, otherwise takes the first option. */
function choose(snap: Snapshot): Action {
  const build = snap.legal.find((a) => a.type.startsWith("BUILD_"));
  return build ?? snap.legal.find((a) => a.type === "END_TURN") ?? snap.legal[0]!;
}

describe("LocalGame", () => {
  it("plays setup plus 20 turns using only what the snapshot offers", async () => {
    const game = new LocalGame(NAMES, "local-test");
    let snap = game.snapshot();
    for (let i = 0; i < 2000 && snap.view.turn.number <= 20; i++) {
      expect(snap.legal.length).toBeGreaterThan(0);
      expect(await game.send(choose(snap))).toBeNull();
      snap = game.snapshot();
    }
    expect(snap.view.turn.number).toBe(21);
    expect(Object.values(snap.scores).reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(8);
  });

  it("only shows the waiting seat its own hand", async () => {
    const game = new LocalGame(NAMES, "redaction");
    for (let i = 0; i < 60; i++) {
      const snap = game.snapshot();
      for (const p of ["p0", "p1", "p2", "p3"]) {
        const zone = snap.view.zones[`hand-${p}`]!;
        if (p === snap.seat) expect(zone.contents).toBeDefined();
        else expect(zone.contents).toBeUndefined();
      }
      await game.send(choose(snap));
    }
  });

  it("returns the rejection for an illegal move and keeps the state", async () => {
    const game = new LocalGame(NAMES, "reject");
    const before = game.snapshot();
    expect((await game.send({ type: "END_TURN" }))?.code).toBe("WRONG_DECISION");
    expect(game.snapshot().view).toEqual(before.view);
  });

  it("notifies subscribers immediately and after each change", async () => {
    const game = new LocalGame(NAMES, "subscribe");
    const seen: number[] = [];
    const stop = game.subscribe((s) => seen.push(s.log.length));
    await game.send(game.snapshot().legal[0]!);
    stop();
    await game.send(game.snapshot().legal[0]!);
    expect(seen).toEqual([0, 1]);
  });

  it("the same seed gives the same board", () => {
    const a = new LocalGame(NAMES, "same").snapshot().view.map;
    const b = new LocalGame(NAMES, "same").snapshot().view.map;
    expect(a).toEqual(b);
  });

  it("plays on the map it is given, with that map's win target", () => {
    const def = findMap("grand-diamond")!.def;
    const view = new LocalGame(["A", "B"], "diamond", def).snapshot().view;
    expect(view.map.id).toBe("grand-diamond");
    expect(view.map.hexes.filter((h) => h.terrain !== "sea")).toHaveLength(49);
    expect(view.options.vpToWin).toBe(12);
  });
});
