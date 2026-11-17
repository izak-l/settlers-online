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
const LOST_SETTLERS = {
  land: { gold: 2, hills: 5, forest: 5, pasture: 5, fields: 5, mountains: 5, desert: 3 },
  tokens: [1, 2, 2, 2, 2, 2, 2, 2, 2, 1],
  ports: { two: 5, three: 1 },
};

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
  // Face-up land and tokens, plus the 12 face-down (fog) hexes; their stack is checked below.
  "misty-passage-3p-fixed": {
    land: { hills: 2, forest: 4, pasture: 4, fields: 2, mountains: 2, fog: 12 },
    tokens: [0, 1, 1, 2, 2, 2, 2, 1, 2, 1],
    ports: { two: 5, three: 3 },
  },
  "misty-passage-4p-fixed": {
    land: { hills: 3, forest: 4, pasture: 4, fields: 3, mountains: 3, fog: 12 },
    tokens: [1, 2, 2, 2, 2, 2, 2, 2, 1, 1],
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
  // One map for 3 and 4 players; every harbor starts on the water (counted with the ports).
  "lost-settlers-3p-fixed": LOST_SETTLERS,
  "lost-settlers-4p-fixed": LOST_SETTLERS,
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
    expect(scenarioMap("four-isles", 2, "variable")!.id).toBe("four-isles-3p-variable");
    expect(scenarioOfMap("four-isles-4p-fixed")).toMatchObject({
      scenario: { id: "four-isles" },
      setup: "fixed",
    });
    expect(mapName("across-the-sands-3p-fixed")).toBe("Across the Sands");
  });

  describe.each(allMaps.map((m) => [m.id, m] as const))("%s", (id, def) => {
    it("matches the rulebook's components", () => {
      // A variable map has the same components as its fixed map, partly in pools.
      const expected = RULEBOOK[id.replace(/-variable$/, "-fixed")]!;
      const land: Record<string, number> = {};
      const tokens = Array(11).fill(0) as number[];
      for (const h of def.hexes) {
        if (h.terrain === "sea" || String(h.terrain).startsWith("pool:")) continue;
        land[String(h.terrain)] = (land[String(h.terrain)] ?? 0) + 1;
        if (typeof h.token === "number") tokens[h.token - 2]!++;
      }
      for (const pool of Object.values(def.pools?.terrain ?? {}))
        for (const [t, n] of Object.entries(pool)) land[t] = (land[t] ?? 0) + (n ?? 0);
      for (const pool of Object.values(def.pools?.tokens ?? {}))
        for (const t of pool) tokens[t - 2]!++;
      expect(land).toEqual(expected.land);
      expect(tokens.filter((_, i) => i !== 5)).toEqual(expected.tokens); // no 7
      const ports = def.ports ?? [];
      const pool = (name: string) =>
        Object.entries(def.pools?.ports?.[name] ?? {}).flatMap(([t, n]) =>
          Array<string>(n!).fill(t),
        );
      const portTypes = [
        ...(ports.some((p) => p.type === "pool:ports") ? pool("ports") : ports.map((p) => p.type)),
        ...pool("harbors"),
      ];
      expect(portTypes.filter((t) => t === "any3to1")).toHaveLength(expected.ports.three);
      expect(portTypes.filter((t) => t !== "any3to1")).toHaveLength(expected.ports.two);
    });

    it("has the rulebook's things on the water", () => {
      const count = (kind: string) => (def.markers ?? []).filter((m) => m.kind === kind).length;
      const expected = id.startsWith("lost-settlers") ? [8, 4, 6] : [0, 0, 0];
      expect([count("vp-token"), count("dev-card"), count("harbor")]).toEqual(expected);
    });

    it("has the rulebook's face-down stack when it has fog", () => {
      const fog = def.scenario?.fog;
      if (!def.hexes.some((h) => h.terrain === "fog")) return expect(fog).toBeUndefined();
      expect(fog!.terrain).toEqual({
        sea: 2,
        gold: 2,
        hills: 2,
        forest: 1,
        pasture: 1,
        fields: 2,
        mountains: 2,
      });
      const facedown = id.startsWith("misty-passage-3p")
        ? [3, 3, 4, 5, 6, 8, 9, 10, 11, 12]
        : [3, 4, 5, 6, 8, 9, 10, 11, 11, 12];
      expect([...fog!.tokens].sort((a, b) => a - b)).toEqual(facedown);
    });

    it("generates boards that keep the regions and the token rules (300 seeds)", () => {
      const fixedId = id.replace(/-variable$/, "-fixed");
      const fixed = allMaps.find((m) => m.id === fixedId)!;
      const regionAt = new Map(fixed.hexes.map((h) => [`${h.q},${h.r}`, h.region]));
      for (let i = 0; i < 300; i++) {
        const { map } = generateMap(def, seedFromString(`var:${id}:${i}`));
        expect(validateResolvedMap(map).ok).toBe(true);
        for (const h of map.hexes) expect(h.region).toBe(regionAt.get(`${h.q},${h.r}`));
        const at = new Map(map.hexes.map((h) => [`${h.q},${h.r}`, h]));
        for (const c of def.constraints ?? []) {
          for (const h of map.hexes) {
            if (typeof c === "object" && c.hexes.includes(`${h.q},${h.r}`))
              expect(c.tokens).not.toContain(h.token);
            const red = h.token === 6 || h.token === 8;
            if (c === "no-red-on-gold") expect(h.terrain === "gold" && red).toBe(false);
            if (c === "no-low-tokens-on-forest-pasture")
              expect(
                (h.terrain === "forest" || h.terrain === "pasture") &&
                  [2, 3, 11, 12].includes(h.token ?? 0),
              ).toBe(false);
            if (c === "no-adjacent-red-tokens" && red) {
              for (const [dq, dr] of [
                [1, 0],
                [1, -1],
                [0, -1],
                [-1, 0],
                [-1, 1],
                [0, 1],
              ] as const) {
                const n = at.get(`${h.q + dq},${h.r + dr}`);
                expect(n?.token === 6 || n?.token === 8).toBe(false);
              }
            }
          }
        }
        expect(map.robberStart).toBeDefined();
      }
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
