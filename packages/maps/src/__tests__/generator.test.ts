import { describe, it, expect } from "vitest";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { seedFromString } from "@settlers/engine";
import { generateMap } from "../generator";
import { validateResolvedMap } from "../validator";
import { MapDefSchema, type MapDef } from "../schema";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_MAP_PATH = join(__dirname, "../../maps/base-4p.json");

async function loadBaseDef(): Promise<MapDef> {
  const raw = await readFile(BASE_MAP_PATH, "utf-8");
  return MapDefSchema.parse(JSON.parse(raw));
}

describe("generateMap — base-4p", () => {
  it("produces 19 land hexes and resolves all terrain", async () => {
    const def = await loadBaseDef();
    const rng = seedFromString("test-seed-1");
    const { map } = generateMap(def, rng);
    const landHexes = map.hexes.filter((h) => h.terrain !== "sea");
    expect(landHexes).toHaveLength(19);
    for (const h of landHexes) {
      expect(typeof h.terrain).toBe("string");
      expect(h.terrain).not.toBe("pool:land");
    }
  });

  it("non-desert land hexes all have tokens", async () => {
    const def = await loadBaseDef();
    const rng = seedFromString("test-seed-2");
    const { map } = generateMap(def, rng);
    const landHexes = map.hexes.filter((h) => h.terrain !== "sea");
    for (const h of landHexes) {
      if (h.terrain !== "desert") {
        expect(h.token, `${h.terrain} at (${h.q},${h.r}) has no token`).toBeDefined();
      }
    }
  });

  it("desert has no token", async () => {
    const def = await loadBaseDef();
    const rng = seedFromString("test-seed-3");
    const { map } = generateMap(def, rng);
    const deserts = map.hexes.filter((h) => h.terrain === "desert");
    expect(deserts).toHaveLength(1);
    expect(deserts[0]!.token).toBeUndefined();
  });

  it("produces 9 ports", async () => {
    const def = await loadBaseDef();
    const rng = seedFromString("test-seed-4");
    const { map } = generateMap(def, rng);
    expect(map.ports).toHaveLength(9);
  });

  it("resolved map passes validation", async () => {
    const def = await loadBaseDef();
    const rng = seedFromString("test-seed-5");
    const { map } = generateMap(def, rng);
    const result = validateResolvedMap(map);
    expect(result.ok, JSON.stringify(result.errors)).toBe(true);
  });

  it("two runs with the same seed produce identical maps", async () => {
    const def = await loadBaseDef();
    const seed = "determinism-check";
    const { map: map1 } = generateMap(def, seedFromString(seed));
    const { map: map2 } = generateMap(def, seedFromString(seed));
    expect(map1.hexes).toEqual(map2.hexes);
    expect(map1.ports).toEqual(map2.ports);
  });

  it("two runs with different seeds produce different terrain arrangements", async () => {
    const def = await loadBaseDef();
    const { map: map1 } = generateMap(def, seedFromString("seed-A"));
    const { map: map2 } = generateMap(def, seedFromString("seed-B"));
    const terrains1 = map1.hexes.map((h) => h.terrain).join(",");
    const terrains2 = map2.hexes.map((h) => h.terrain).join(",");
    expect(terrains1).not.toBe(terrains2);
  });
});

describe("no-adjacent-red-tokens constraint — 10,000 seeds", () => {
  it("never violated across 10k seeds", async () => {
    const def = await loadBaseDef();
    const RED = new Set([6, 8]);

    for (let i = 0; i < 10_000; i++) {
      const rng = seedFromString(`fuzz-${i}`);
      const { map } = generateMap(def, rng);
      const landHexes = map.hexes.filter((h) => h.terrain !== "sea");
      const tokenMap = new Map(landHexes.map((h) => [`${h.q},${h.r}`, h.token]));

      for (const h of landHexes) {
        if (!h.token || !RED.has(h.token)) continue;
        const neighbors = [
          { q: h.q + 1, r: h.r },
          { q: h.q + 1, r: h.r - 1 },
          { q: h.q, r: h.r - 1 },
          { q: h.q - 1, r: h.r },
          { q: h.q - 1, r: h.r + 1 },
          { q: h.q, r: h.r + 1 },
        ];
        for (const n of neighbors) {
          const nToken = tokenMap.get(`${n.q},${n.r}`);
          if (nToken !== undefined && RED.has(nToken)) {
            throw new Error(
              `Seed fuzz-${i}: adjacent red tokens at (${h.q},${h.r})=${h.token} and (${n.q},${n.r})=${nToken}`,
            );
          }
        }
      }
    }
  }, 60_000); // 60s timeout for 10k iterations
});

describe("port placement", () => {
  it("never puts two ports on edges that share a corner (1,000 seeds)", async () => {
    const { buildGraph } = await import("@settlers/engine");
    const def = await loadBaseDef();
    for (let i = 0; i < 1000; i++) {
      const { map } = generateMap(def, seedFromString(`ports-${i}`));
      const graph = buildGraph(map.hexes.filter((h) => h.terrain !== "sea"));
      const corners = map.ports.flatMap((p) => graph.edges.get(p.edgeId)!.vertices);
      expect(new Set(corners).size, `seed ports-${i}`).toBe(corners.length);
    }
  });

  it("uses each port type from the pool exactly once", async () => {
    const def = await loadBaseDef();
    const { map } = generateMap(def, seedFromString("port-types"));
    const counts: Record<string, number> = {};
    for (const p of map.ports) counts[p.type] = (counts[p.type] ?? 0) + 1;
    expect(counts).toEqual(def.pools!.ports);
  });
});
