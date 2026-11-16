import { expect, it } from "vitest";
import { createHash } from "node:crypto";
import { createGame, legalActions, apply, toSnapshot } from "../engine";
import type { Action } from "../actions";
import { fixtureMap } from "./testkit";

const ORDER = [
  "BUILD_CITY",
  "BUILD_SETTLEMENT",
  "PLACE_SETTLEMENT",
  "PLACE_ROAD",
  "PLACE_FREE_ROAD",
  "DISCARD",
  "MOVE_ROBBER",
  "STEAL",
  "PLAY_KNIGHT",
  "PLAY_ROAD_BUILDING",
  "PLAY_YEAR_OF_PLENTY",
  "PLAY_MONOPOLY",
  "BUY_DEV_CARD",
  "BUILD_ROAD",
  "ROLL",
  "BANK_TRADE",
  "END_TURN",
];

function pick(legal: Action[], n: number): Action {
  for (const type of ORDER) {
    const options = legal.filter((a) => a.type === type);
    // Bank trades only every 5th step, so the bot doesn't trade forever.
    if (type === "BANK_TRADE" && n % 5 !== 0) continue;
    if (options.length > 0) return options[(n * 7919 + 13) % options.length]!;
  }
  return legal[0]!;
}

/**
 * Base no-change test (decision record 0001): three full base games, played by a fixed builder
 * bot, must end in exactly the state the engine produced before the seafaring seams existed
 * (fingerprints taken at commit ff17d54). If a base rule changes on purpose, recompute them and
 * say why in the commit.
 */
const GOLDEN: [string, number, string, string][] = [
  ["golden-1", 675, "p1", "e0a0248b9a5530b7053891463c82a47d2990239a7a0c9b3b7642f82c1fb97be0"],
  ["golden-2", 1139, "p0", "96af114e03eed2ba7568f801495123c53a8542577358917cbfbc639909c02963"],
  ["golden-3", 1375, "p3", "47bc86e65c15675433b6e5aa9ea1ed2d7a9c4b2b1312c67956b4480d4a3a2237"],
];

it.each(GOLDEN)(
  "base game %s plays out exactly as before the seams",
  (seed, steps, winner, hash) => {
    {
      let s = createGame(fixtureMap(), { modules: ["base"] }, ["p0", "p1", "p2", "p3"], seed);
      let n = 0;
      for (; n < 5000 && s.winner === undefined; n++) {
        const p = s.decisions.at(-1)!.pendingFrom[0]!;
        const r = apply(s, p, pick(legalActions(s, p), n));
        if (!r.ok) throw new Error(r.code);
        s = r.state;
      }
      expect([n, s.winner]).toEqual([steps, winner]);
      expect(
        createHash("sha256")
          .update(JSON.stringify(toSnapshot(s)))
          .digest("hex"),
      ).toBe(hash);
    }
  },
);
