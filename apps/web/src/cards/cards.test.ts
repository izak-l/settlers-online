import { describe, it, expect } from "vitest";
import { layoutFan, fanWidth } from "./fan";
import { handDiff, partnerFromEvents } from "./handDiff";
import { addPick, removePick, startPick, bankGive, total, type Pick } from "./picking";

describe("layoutFan", () => {
  const card = 48;
  const opts = (width: number, groups: number[]) => ({ width, cardW: card, gap: 8, groups });

  it("lays out an empty hand", () => {
    expect(layoutFan(opts(343, [0, 0, 0, 0, 0])).shown).toEqual([0, 0, 0, 0, 0]);
  });

  it("uses generous overlap for small hands", () => {
    const f = layoutFan(opts(343, [1, 2, 0, 1, 0]));
    expect(f.sliver).toBe(card * 0.5);
    expect(f.shown).toEqual([1, 2, 0, 1, 0]);
  });

  for (const width of [343, 1100]) {
    for (let n = 0; n <= 30; n++) {
      it(`fits ${n} cards in ${width}px without going below the minimum sliver`, () => {
        // Spread n cards over 5 groups, front-loaded.
        const groups = [0, 0, 0, 0, 0].map((_, i) => Math.floor(n / 5) + (i < n % 5 ? 1 : 0));
        const f = layoutFan(opts(width, groups));
        expect(fanWidth(f, card, 8)).toBeLessThanOrEqual(width);
        expect(f.sliver).toBeGreaterThanOrEqual(6);
        f.shown.forEach((s, i) => {
          expect(s).toBeLessThanOrEqual(groups[i]!);
          if (groups[i]! > 0) expect(s).toBeGreaterThan(0);
        });
      });
    }
  }

  it("caps big groups on a narrow screen (the badge carries the total)", () => {
    const f = layoutFan(opts(343, [20, 15, 1, 1, 1]));
    expect(f.shown[0]).toBeLessThan(20);
    expect(f.shown[2]).toBe(1);
  });
});

describe("handDiff", () => {
  const hands = (mine: Record<string, number>, others: Record<string, number>) => ({
    mine,
    others,
  });

  it("finds nothing on the first snapshot", () => {
    expect(handDiff(null, hands({ wood: 2 }, { p1: 3 }))).toEqual([]);
  });

  it("production comes from the bank", () => {
    const d = handDiff(hands({ wood: 1 }, { p1: 3 }), hands({ wood: 3, ore: 1 }, { p1: 4 }));
    expect(d).toEqual([
      { resource: "wood", n: 2, dir: "in", from: "bank" },
      { resource: "ore", n: 1, dir: "in", from: "bank" },
    ]);
  });

  it("a steal comes from the player who lost a card", () => {
    const d = handDiff(hands({}, { p1: 3, p2: 2 }), hands({ sheep: 1 }, { p1: 2, p2: 2 }));
    expect(d).toEqual([{ resource: "sheep", n: 1, dir: "in", from: "p1" }]);
  });

  it("a trade: cards go to and come from the partner, even when counts don't change", () => {
    const d = handDiff(
      hands({ wood: 2 }, { p1: 3, p2: 5 }),
      hands({ wood: 0, ore: 1 }, { p1: 4, p2: 5 }),
      "p1",
    );
    expect(d).toEqual([
      { resource: "wood", n: 2, dir: "out", from: "p1" },
      { resource: "ore", n: 1, dir: "in", from: "p1" },
    ]);
  });

  it("finds the other player in a trade or steal you were part of", () => {
    const traded = { type: "TRADED", text: "", data: { from: "p2", with: "p0" } };
    const stole = { type: "STOLE", text: "", data: { thief: "p0", victim: "p3" } };
    const other = { type: "STOLE", text: "", data: { thief: "p1", victim: "p3" } };
    expect(partnerFromEvents([traded], "p0")).toBe("p2");
    expect(partnerFromEvents([stole], "p0")).toBe("p3");
    expect(partnerFromEvents([other], "p0")).toBeUndefined();
    expect(partnerFromEvents([], "spectator")).toBeUndefined();
  });

  it("Monopoly takes from several players", () => {
    const d = handDiff(hands({}, { p1: 3, p2: 5 }), hands({ wheat: 3 }, { p1: 2, p2: 3 }));
    expect(d).toEqual([
      { resource: "wheat", n: 1, dir: "in", from: "p1" },
      { resource: "wheat", n: 2, dir: "in", from: "p2" },
    ]);
  });

  it("building spends to the bank", () => {
    const d = handDiff(hands({ wood: 1, brick: 1 }, { p1: 3 }), hands({}, { p1: 3 }));
    expect(d).toEqual([
      { resource: "wood", n: 1, dir: "out", from: "bank" },
      { resource: "brick", n: 1, dir: "out", from: "bank" },
    ]);
  });
});

describe("picking", () => {
  const hand = { wood: 2, ore: 1 };

  it("can't pick more of a resource than you hold, or past the limit", () => {
    let p: Pick = startPick("discard", { giveLimit: 2 });
    p = addPick(p, "give", "wood", hand);
    p = addPick(p, "give", "wood", hand);
    p = addPick(p, "give", "wood", hand);
    expect(p.give).toEqual({ wood: 2 });
    p = removePick(p, "give", "wood");
    p = addPick(p, "give", "ore", hand);
    p = addPick(p, "give", "ore", hand);
    expect(p.give).toEqual({ wood: 1, ore: 1 });
    p = addPick(p, "give", "wood", hand);
    expect(total(p.give)).toBe(2);
  });

  it("removing the last card of a resource drops the key", () => {
    let p = addPick(startPick("offer"), "want", "sheep", hand);
    p = removePick(p, "want", "sheep");
    expect(p.want).toEqual({});
  });

  it("bank trades take your rate's worth, and only if you have it", () => {
    let p = startPick("bank");
    p = bankGive(p, "wood", 2, hand);
    expect(p.give).toEqual({ wood: 2 });
    p = bankGive(p, "ore", 3, hand);
    expect(p.give).toEqual({ wood: 2 });
  });

  it("want limits apply (two Bounty picks, one Monopoly pick replaces)", () => {
    let p = startPick("bounty", { wantLimit: 2 });
    for (const r of ["wood", "ore", "sheep"]) p = addPick(p, "want", r, hand);
    expect(p.want).toEqual({ wood: 1, ore: 1 });
    let m = startPick("monopoly", { wantLimit: 1 });
    m = addPick(m, "want", "wood", hand);
    m = addPick(m, "want", "ore", hand);
    expect(m.want).toEqual({ ore: 1 });
  });
});
