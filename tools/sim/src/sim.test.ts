import { describe, expect, it } from "vitest";
import { MAP_CATALOG } from "@settlers/maps";
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

  it("10 two-player games run clean", () => {
    for (let i = 0; i < 10; i++) playGame(`ci2-${i}`, { seats: 2 });
  }, 120_000);

  it("10 one-player games run clean, including seed 1-1 (the bot used to offer trades solo)", () => {
    playGame("1-1", { seats: 1 });
    for (let i = 0; i < 10; i++) playGame(`ci1-${i}`, { seats: 1 });
  }, 120_000);

  it("games produce winners", () => {
    const winners = Array.from({ length: 10 }, (_, i) => playGame(`ci-win-${i}`).winner);
    expect(winners.filter((w) => w !== null).length).toBeGreaterThan(5);
  }, 120_000);

  it("10 games on each other catalog map run clean (both ends of its player range)", () => {
    for (const m of MAP_CATALOG.filter((m) => m.id !== "base-4p")) {
      for (let i = 0; i < 5; i++) {
        playGame(`ci-${m.id}-${i}`, { seats: m.def.players.min, map: m.id });
        playGame(`ci-${m.id}-max-${i}`, { seats: m.def.players.max, map: m.id });
      }
    }
  });

  it("Lost Settlers runs clean: fixed and variable, 3 and 4 players (spec 018)", () => {
    for (const size of ["3p", "4p"])
      for (const setup of ["fixed", "variable"])
        for (let i = 0; i < 3; i++)
          playGame(`ci-lost-${size}-${setup}-${i}`, {
            seats: size === "3p" ? 3 : 4,
            map: `lost-settlers-${size}-${setup}`,
            maxTurns: 150,
          });
  }, 120_000);

  it("Weavers' Isles runs clean: fixed and variable, 3 and 4 players (spec 019)", () => {
    for (const size of ["3p", "4p"])
      for (const setup of ["fixed", "variable"])
        for (let i = 0; i < 3; i++)
          playGame(`ci-weavers-${size}-${setup}-${i}`, {
            seats: size === "3p" ? 3 : 4,
            map: `weavers-isles-${size}-${setup}`,
            maxTurns: 150,
          });
  }, 120_000);

  it("plays on the chosen map and refuses an unknown one", () => {
    expect(playGame("map-check", { seats: 2, map: "grand-diamond", maxTurns: 1 }).map).toBe(
      "grand-diamond",
    );
    expect(() => playGame("x", { map: "no-such-map" })).toThrow(/Unknown map/);
  });
});
