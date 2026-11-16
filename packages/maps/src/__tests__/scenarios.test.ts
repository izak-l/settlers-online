import { describe, expect, it } from "vitest";
import { readdirSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { apply, createGame, legalActions, seedFromString } from "@settlers/engine";
import { generateMap } from "../generator";
import { mapName } from "../catalog";
import { SCENARIO_CATALOG, scenarioMap, scenarioOfMap } from "../scenarios";
import { validateMapDef, validateResolvedMap } from "../validator";
import type { MapDef } from "../schema";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "../../scenarios");

/**
 * The rulebook's component tables (2025 edition): land per terrain, number tokens 2–12, and
 * ports. Sea isn't compared: the frame encloses two more water spaces than the rulebook's sea
 * tiles (the frame pieces carry printed sea), and we make every water space a sea hex.
 */
const RULEBOOK: Record<
  string,
  { land: Record<string, number>; tokens: number[]; ports: { two: number; three: number } }
> = {
  "new-horizons-3p-fixed": {
    land: { gold: 2, hills: 4, forest: 3, pasture: 5, fields: 4, mountains: 4 },
    tokens: [1, 2, 3, 3, 2, 3, 2, 3, 2, 1],
    ports: { two: 5, three: 3 },
  },
  "new-horizons-4p-fixed": {
    land: { gold: 2, hills: 5, forest: 5, pasture: 5, fields: 5, mountains: 5, desert: 1 },
    tokens: [2, 3, 3, 3, 3, 3, 3, 3, 3, 1],
    ports: { two: 5, three: 4 },
  },
  "four-isles-3p-fixed": {
    land: { hills: 4, forest: 4, pasture: 4, fields: 4, mountains: 4 },
    tokens: [1, 2, 2, 3, 2, 2, 3, 2, 2, 1],
    ports: { two: 5, three: 4 },
  },
  "four-isles-4p-fixed": {
    land: { hills: 4, forest: 5, pasture: 5, fields: 5, mountains: 4 },
    tokens: [1, 2, 3, 3, 2, 2, 3, 3, 3, 1],
    ports: { two: 5, three: 4 },
  },
  "across-the-sands-3p-fixed": {
    land: { gold: 2, hills: 3, forest: 5, pasture: 4, fields: 4, mountains: 4, desert: 3 },
    tokens: [1, 2, 3, 3, 3, 3, 3, 2, 1, 1],
    ports: { two: 5, three: 3 },
  },
  "across-the-sands-4p-fixed": {
    land: { gold: 2, hills: 5, forest: 5, pasture: 5, fields: 5, mountains: 5, desert: 3 },
    tokens: [1, 3, 3, 3, 3, 3, 3, 3, 3, 2],
    ports: { two: 5, three: 4 },
  },
};

const allMaps = SCENARIO_CATALOG.flatMap((s) => Object.values(s.maps) as MapDef[]);

describe("scenario catalog", () => {
  it("lists every scenario map file", () => {
    const files = readdirSync(DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .flatMap((d) =>
        readdirSync(join(DIR, d.name))
          .filter((f) => f.endsWith(".json"))
          .map((f) => `${d.name}-${f.replace(/\.json$/, "")}`),
      )
      .sort();
    expect(allMaps.map((m) => m.id).sort()).toEqual(files);
  });

  it("picks the 3-player map for 1–3 seats and the 4-player map for 4", () => {
    expect(scenarioMap("new-horizons", 1, "fixed")!.id).toBe("new-horizons-3p-fixed");
    expect(scenarioMap("new-horizons", 3, "fixed")!.id).toBe("new-horizons-3p-fixed");
    expect(scenarioMap("new-horizons", 4, "fixed")!.id).toBe("new-horizons-4p-fixed");
    expect(scenarioMap("nope", 4, "fixed")).toBeUndefined();
    expect(scenarioOfMap("four-isles-4p-fixed")).toMatchObject({
      scenario: { id: "four-isles" },
      setup: "fixed",
    });
    expect(mapName("across-the-sands-3p-fixed")).toBe("Across the Sands");
  });

  describe.each(allMaps.map((m) => [m.id, m] as const))("%s", (id, def) => {
    it("matches the rulebook's components", () => {
      const expected = RULEBOOK[id]!;
      const land: Record<string, number> = {};
      const tokens = Array(11).fill(0) as number[];
      for (const h of def.hexes) {
        if (h.terrain === "sea") continue;
        land[String(h.terrain)] = (land[String(h.terrain)] ?? 0) + 1;
        if (typeof h.token === "number") tokens[h.token - 2]!++;
      }
      expect(land).toEqual(expected.land);
      expect(tokens.filter((_, i) => i !== 5)).toEqual(expected.tokens); // no 7
      const ports = def.ports ?? [];
      expect(ports.filter((p) => p.type === "any3to1")).toHaveLength(expected.ports.three);
      expect(ports.filter((p) => p.type !== "any3to1")).toHaveLength(expected.ports.two);
    });

    it("validates, generates and sets up with every seat count it allows", () => {
      expect(validateMapDef(def)).toEqual({ ok: true, errors: [] });
      const { map } = generateMap(def, seedFromString(`scenario:${id}`));
      expect(validateResolvedMap(map)).toEqual({ ok: true, errors: [] });
      for (let seats = def.players.min; seats <= def.players.max; seats++) {
        const players = Array.from({ length: seats }, (_, i) => `p${i}`);
        let s = createGame(map, { modules: def.modules }, players, `setup:${id}`);
        while (s.decisions.at(-1)!.kind !== "ROLL") {
          const p = s.decisions.at(-1)!.pendingFrom[0]!;
          const legal = legalActions(s, p);
          expect(legal.length, `${id}: stuck in setup`).toBeGreaterThan(0);
          const res = apply(s, p, legal[0]!);
          if (!res.ok) throw new Error(res.message);
          s = res.state;
        }
      }
    });
  });
});
