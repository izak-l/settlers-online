import { describe, expect, it } from "vitest";
import { playGame } from "./sim";

/**
 * A small fuzz batch for CI (the full run is `pnpm sim --games 10000 --seed 1`).
 * Every game checks every invariant after every action, then replays from the seed and
 * resumes from a key-scrambled snapshot.
 */
describe("fuzz: random bots", () => {
  it("30 four-player games run clean", () => {
    for (let i = 0; i < 30; i++) playGame(`ci-${i}`, { seats: 4 });
  }, 120_000);

  it("15 three-player games run clean", () => {
    for (let i = 0; i < 15; i++) playGame(`ci3-${i}`, { seats: 3 });
  }, 120_000);

  it("games produce winners", () => {
    const winners = Array.from({ length: 10 }, (_, i) => playGame(`ci-win-${i}`).winner);
    expect(winners.filter((w) => w !== null).length).toBeGreaterThan(5);
  }, 120_000);
});
