import { describe, expect, it } from "vitest";
import { pickResetKey } from "./picking";

const snap = (seat: string, turn: number, kinds: string[]) => ({
  seat,
  view: { turn: { number: turn }, decisions: kinds.map((kind) => ({ kind })) },
});

describe("pickResetKey (bug #1, spec 231)", () => {
  it("doesn't change when someone else finishes the same discard", () => {
    // pendingFrom isn't part of the key: only seat, turn, depth and kind.
    expect(pickResetKey(snap("p1", 5, ["MAIN", "MOVE_ROBBER", "DISCARD"]))).toBe(
      pickResetKey(snap("p1", 5, ["MAIN", "MOVE_ROBBER", "DISCARD"])),
    );
  });
  it("changes for a new decision, turn or seat", () => {
    const base = pickResetKey(snap("p1", 5, ["MAIN", "MOVE_ROBBER", "DISCARD"]));
    expect(pickResetKey(snap("p1", 5, ["MAIN", "MOVE_ROBBER"]))).not.toBe(base);
    expect(pickResetKey(snap("p1", 6, ["MAIN", "MOVE_ROBBER", "DISCARD"]))).not.toBe(base);
    expect(pickResetKey(snap("p2", 5, ["MAIN", "MOVE_ROBBER", "DISCARD"]))).not.toBe(base);
  });
});
