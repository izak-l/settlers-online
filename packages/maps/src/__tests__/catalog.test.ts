import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { MODULE_IDS, seedFromString } from "@settlers/engine";
import { DEFAULT_MAP_ID, MAP_CATALOG, findMap, mapsForSeats } from "../catalog";
import { generateMap } from "../generator";
import { validateMapDef, validateResolvedMap } from "../validator";
import { MapDefSchema } from "../schema";

const MAPS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../maps");
const SEEDS = 1000;

describe("map catalog", () => {
  it("lists every JSON file in maps/ (add an import in catalog.ts for a new file)", () => {
    const files = readdirSync(MAPS_DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
    expect(MAP_CATALOG.map((m) => m.id).sort()).toEqual(files);
  });

  it("starts with the default base map", () => {
    expect(DEFAULT_MAP_ID).toBe("base-4p");
    expect(MAP_CATALOG[0]!.id).toBe(DEFAULT_MAP_ID);
  });

  it("has unique ids that match the file and the definition", () => {
    const ids = MAP_CATALOG.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of MAP_CATALOG) {
      const raw = JSON.parse(readFileSync(join(MAPS_DIR, `${m.id}.json`), "utf-8")) as unknown;
      expect(MapDefSchema.parse(raw)).toEqual(m.def);
      expect(m.def.id).toBe(m.id);
    }
  });

  it("finds maps by id and filters by seat count", () => {
    expect(findMap("grand-diamond")?.name).toBe("Grand Diamond");
    expect(findMap("nope")).toBeUndefined();
    for (const n of [1, 2, 3, 4]) {
      for (const m of mapsForSeats(n)) {
        expect(n).toBeGreaterThanOrEqual(m.def.players.min);
        expect(n).toBeLessThanOrEqual(m.def.players.max);
      }
    }
    expect(mapsForSeats(1).map((m) => m.id)).toContain(DEFAULT_MAP_ID);
  });

  describe.each(MAP_CATALOG.map((m) => [m.id, m] as const))("%s", (_id, m) => {
    it("has its own name and description", () => {
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.description.length).toBeGreaterThan(0);
    });

    it("has a sane player range and only modules the engine has", () => {
      const { min, max } = m.def.players;
      expect(1 <= min && min <= max && max <= 4).toBe(true);
      for (const id of m.def.modules) expect(MODULE_IDS).toContain(id);
      expect(m.def.modules).toContain("base");
    });

    it("passes the map validator", () => {
      expect(validateMapDef(m.def)).toEqual({ ok: true, errors: [] });
    });

    it(`generates a valid board for ${SEEDS} seeds`, () => {
      for (let i = 0; i < SEEDS; i++) {
        const { map } = generateMap(m.def, seedFromString(`catalog:${m.id}:${i}`));
        const result = validateResolvedMap(map);
        if (!result.ok) throw new Error(`seed ${i}: ${JSON.stringify(result.errors)}`);
      }
    }, 60_000);
  });
});
