import { describe, it, expect } from "vitest";
import type { GameEvent } from "@settlers/engine";
import { cuesFor, type CueInput } from "./cues";
import { LocalGame, type Snapshot } from "../game/LocalGame";

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
      ["BUILT_ROAD", "road"],
      ["PLACED_ROAD", "road"],
      ["BUILT_SETTLEMENT", "settlement"],
      ["PLACED_SETTLEMENT", "settlement"],
      ["BUILT_CITY", "city"],
      ["BOUGHT_DEV_CARD", "devcard"],
      ["BUILT_SHIP", "road"],
      ["PLACED_SHIP", "road"],
      ["MOVED_SHIP", "build"],
      ["AWARD", "award"],
    ];
    for (const [type, cue] of cases)
      expect(cuesFor(before, snap("p0", [ev(type)], main("p1")), opts)).toEqual([cue]);
  });

  it("robber and pirate movement are silent, including when no theft follows", () => {
    const before = snap("p0", [], main("p1"));
    for (const type of ["MOVED_ROBBER", "MOVED_PIRATE"])
      expect(cuesFor(before, snap("p0", [ev(type)], main("p1")), opts)).toEqual([]);
  });

  it("plays every setup road across automatic sandbox seat switches", async () => {
    const game = new LocalGame(["A", "B", "C", "D"], "setup-road-sounds");
    const input = (s: Snapshot): CueInput => ({
      seat: s.seat,
      log: s.log,
      top: s.view.decisions.at(-1),
      hand: s.view.zones[`hand-${s.seat}`]?.contents ?? {},
    });
    let roads = 0;
    let switched = 0;
    while (game.snapshot().view.turn.number === 0) {
      const before = game.snapshot();
      const action = before.legal[0]!;
      expect(await game.send(action)).toBeNull();
      const after = game.snapshot();
      if (action.type !== "PLACE_ROAD") continue;
      roads++;
      if (before.seat !== after.seat) switched++;
      expect(cuesFor(input(before), input(after), opts)).toContain("road");
    }
    expect(roads).toBe(8);
    expect(switched).toBeGreaterThan(0);
  });

  it("seat changes preserve public placements without replaying private history or comparing hands", () => {
    const privateEvent: GameEvent = { type: "STOLE", text: "private", visibleTo: ["p0"] };
    const publicEvent = ev("BUILT_CITY");
    const before = snap("p0", [privateEvent, publicEvent], main("p0"), {});
    const after = snap("p1", [publicEvent, ev("PLACED_ROAD")], main("p1"), { wood: 12 });
    expect(cuesFor(before, after, opts)).toEqual(["road"]);
    expect(cuesFor(before, after, { hidden: true })).toEqual([]);
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
