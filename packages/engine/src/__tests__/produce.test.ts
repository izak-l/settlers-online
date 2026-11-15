import { describe, it, expect } from "vitest";
import { produce } from "../modules/base";
import type { GameState } from "../types";
import { checkInvariants, h, hand, inMainPhase, newGame, v, withPiece } from "./testkit";

// (1,0) is forest with token 6 on the fixture.
const P0_SPOT = v(h(0, 0), h(1, 0), h(1, -1)); // desert, forest 6, hills 8
const P1_SPOT = v(h(1, 0), h(2, 0), h(2, -1)); // forest 6, pasture 11, fields 3

function board(): GameState {
  let s = inMainPhase(newGame());
  s = withPiece(s, "settlement", "p0", { vertex: P0_SPOT });
  s = withPiece(s, "city", "p1", { vertex: P1_SPOT });
  return s;
}

function setBank(s: GameState, resource: string, n: number): GameState {
  // Park the excess in p2's hand so totals still add up to 19.
  const bank = s.zones["bank"]!.contents;
  const p2 = s.zones["hand-p2"]!.contents;
  p2[resource] = (p2[resource] ?? 0) + (bank[resource] ?? 0) - n;
  bank[resource] = n;
  return s;
}

describe("produce", () => {
  it("pays 1 per settlement and 2 per city on hexes with the rolled token", () => {
    const s = board();
    produce(s, 6);
    expect(hand(s, "p0")["wood"]).toBe(1);
    expect(hand(s, "p1")["wood"]).toBe(2);
    expect(s.zones["bank"]!.contents["wood"]).toBe(16);
    checkInvariants(s);
  });

  it("pays nothing from the hex the robber is on", () => {
    const s = board();
    const robber = Object.values(s.pieces).find((p) => p.type === "robber")!;
    robber.at = { hex: "1,0" };
    produce(s, 6);
    expect(hand(s, "p0")["wood"]).toBe(0);
    expect(hand(s, "p1")["wood"]).toBe(0);
  });

  it("pays nobody a resource the bank can't cover for everyone owed it", () => {
    const s = setBank(board(), "wood", 2); // owed 1 + 2 = 3
    produce(s, 6);
    expect(hand(s, "p0")["wood"]).toBe(0);
    expect(hand(s, "p1")["wood"]).toBe(0);
    expect(s.zones["bank"]!.contents["wood"]).toBe(2);
    checkInvariants(s);
  });

  it("gives a lone claimant whatever the bank has left", () => {
    let s = inMainPhase(newGame());
    s = withPiece(s, "city", "p1", { vertex: P1_SPOT });
    s = setBank(s, "wood", 1);
    produce(s, 6);
    expect(hand(s, "p1")["wood"]).toBe(1);
    expect(s.zones["bank"]!.contents["wood"]).toBe(0);
    checkInvariants(s);
  });

  it("shortage of one resource doesn't block another", () => {
    // Roll 3: fields (2,-1) pays p1's city 2 wheat. Wood is short but irrelevant.
    const s = setBank(board(), "wood", 0);
    produce(s, 3);
    expect(hand(s, "p1")["wheat"]).toBe(2);
  });
});
