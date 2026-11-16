import { describe, it, expect } from "vitest";
import type { GameEvent } from "@settlers/engine";
import { cuesFor, type CueInput } from "./cues";

type Decision = { kind: string; pendingFrom: string[]; data?: Record<string, unknown> };

function snap(
  seat: string,
  log: GameEvent[],
  top: Decision,
  mine: Record<string, number> = {},
): CueInput {
  return { seat, log, top, hand: mine };
}
const ev = (type: string, data?: Record<string, unknown>): GameEvent => ({
  type,
  text: "",
  ...(data ? { data } : {}),
});
const main = (who: string): Decision => ({ kind: "MAIN", pendingFrom: [who] });
const roll = (who: string): Decision => ({ kind: "ROLL", pendingFrom: [who] });
const opts = { hidden: false };

describe("cuesFor", () => {
  it("gives nothing for the first snapshot (history on join)", () => {
    expect(cuesFor(null, snap("p0", [ev("ROLLED")], main("p0")), opts)).toEqual([]);
  });

  it("maps events to cues", () => {
    const before = snap("p0", [], main("p1"));
    const cases: [string, string][] = [
      ["ROLLED", "dice"],
      ["BUILT_ROAD", "build"],
      ["PLACED_SETTLEMENT", "build"],
      ["BUILT_CITY", "city"],
      ["BOUGHT_DEV_CARD", "devcard"],
      ["MOVED_ROBBER", "robber"],
      ["AWARD", "award"],
    ];
    for (const [type, cue] of cases)
      expect(cuesFor(before, snap("p0", [ev(type)], main("p1")), opts)).toEqual([cue]);
  });

  it("your turn fires only for you, when it starts", () => {
    const before = snap("p0", [], main("p3"));
    expect(cuesFor(before, snap("p0", [ev("TURN_ENDED")], roll("p0")), opts)).toEqual(["yourTurn"]);
    expect(cuesFor(before, snap("p1", [ev("TURN_ENDED")], roll("p0")), opts)).toEqual([]);
    const spectator = snap("spectator", [], main("p3"));
    expect(cuesFor(spectator, snap("spectator", [], roll("p0")), opts)).toEqual([]);
  });

  it("a roll that pays you plays the dice, then a card sound (at most two cues)", () => {
    const before = snap("p0", [], roll("p1"), { wood: 1 });
    const after = snap("p0", [ev("ROLLED"), ev("PRODUCED"), ev("PRODUCED")], main("p1"), {
      wood: 3,
    });
    expect(cuesFor(before, after, opts)).toEqual(["dice", "gain"]);
  });

  it("a 7 that makes you discard: the discard cue comes first", () => {
    const before = snap("p0", [], roll("p1"));
    const after = snap("p0", [ev("ROLLED")], { kind: "DISCARD", pendingFrom: ["p0", "p2"] });
    expect(cuesFor(before, after, opts)).toEqual(["discard", "dice"]);
  });

  it("steals: personal only for the thief and the victim", () => {
    const before = snap("p0", [], main("p1"));
    const stole = ev("STOLE", { thief: "p1", victim: "p0" });
    expect(cuesFor(before, snap("p0", [stole], main("p1")), { hidden: true })).toEqual(["steal"]);
    const other = snap("p2", [], main("p1"));
    expect(cuesFor(other, snap("p2", [stole], main("p1")), { hidden: true })).toEqual([]);
    expect(cuesFor(other, snap("p2", [stole], main("p1")), opts)).toEqual(["steal"]);
  });

  it("offers: anyone who can answer hears it, even in a hidden tab; the offerer hears answers", () => {
    const offer: Decision = {
      kind: "TRADE_OFFER",
      pendingFrom: ["p0", "p1"],
      data: { from: "p0" },
    };
    const before = snap("p1", [], main("p0"));
    expect(cuesFor(before, snap("p1", [ev("OFFERED_TRADE")], offer), { hidden: true })).toEqual([
      "offer",
    ]);
    const mine = snap("p0", [], offer);
    expect(cuesFor(mine, snap("p0", [ev("RESPONDED_TRADE")], offer), opts)).toEqual(["respond"]);
    const watcher = snap("p2", [], offer);
    expect(cuesFor(watcher, snap("p2", [ev("RESPONDED_TRADE")], offer), opts)).toEqual([]);
  });

  it("a hidden tab keeps only cues about you", () => {
    const before = snap("p0", [], main("p3"));
    const after = snap("p0", [ev("ROLLED"), ev("BUILT_CITY")], main("p3"));
    expect(cuesFor(before, after, { hidden: true })).toEqual([]);
    const win = snap("p0", [ev("GAME_WON", { winner: "p3" })], main("p3"));
    expect(cuesFor(before, win, { hidden: true })).toEqual(["win"]);
  });
});
