import { describe, expect, it } from "vitest";
import { MAP_CATALOG } from "../catalog";
import {
  GAME_TYPES,
  defaultMapForType,
  findGameType,
  gameTypeOfMap,
  mapForType,
  mapsForType,
  scenariosForType,
} from "../gameTypes";
import { SCENARIO_CATALOG } from "../scenarios";

const type = (id: string) => findGameType(id)!;

describe("game types (spec 023)", () => {
  it("are base, seafaring for 3 and seafaring for 4", () => {
    expect(GAME_TYPES.map((t) => [t.id, t.maxPlayers])).toEqual([
      ["base", 4],
      ["seafaring-3", 3],
      ["seafaring-4", 4],
    ]);
  });

  it("base offers the base-only maps and no scenarios", () => {
    const ids = mapsForType(type("base")).map((m) => m.id);
    expect(ids).toContain("base-4p");
    expect(ids).toContain("grand-diamond");
    expect(scenariosForType(type("base"))).toEqual([]);
  });

  it("seafaring types offer every scenario at their size, and no base-only maps", () => {
    for (const id of ["seafaring-3", "seafaring-4"]) {
      const t = type(id);
      expect(scenariosForType(t).map((s) => s.id)).toEqual(SCENARIO_CATALOG.map((s) => s.id));
      for (const m of mapsForType(t)) expect(m.def.modules).toContain("seafaring");
    }
  });

  it("resolves a choice only within its type, at the type's size", () => {
    const s3 = mapForType(type("seafaring-3"), { scenario: "lost-settlers", setup: "variable" });
    expect(s3?.id).toBe("lost-settlers-3p-variable");
    expect(mapForType(type("seafaring-4"), { scenario: "new-horizons", setup: "fixed" })?.id).toBe(
      "new-horizons-4p-fixed",
    );
    expect(mapForType(type("base"), { scenario: "new-horizons", setup: "fixed" })).toBeUndefined();
    expect(mapForType(type("seafaring-4"), { builtin: "base-4p" })).toBeUndefined();
    expect(mapForType(type("base"), { builtin: "grand-diamond" })?.id).toBe("grand-diamond");
  });

  it("every map belongs to a type, and each type has a default map", () => {
    for (const m of MAP_CATALOG) {
      expect(GAME_TYPES.some((t) => mapsForType(t).some((x) => x.id === m.id))).toBe(true);
    }
    expect(defaultMapForType(type("base")).id).toBe("base-4p");
    for (const t of GAME_TYPES) expect(gameTypeOfMap(defaultMapForType(t))).toBe(t.id);
  });

  it("works out an old lobby's type from its map", () => {
    expect(gameTypeOfMap(SCENARIO_CATALOG[0]!.maps["3p-fixed"]!)).toBe("seafaring-3");
    expect(gameTypeOfMap(SCENARIO_CATALOG[0]!.maps["4p-variable"]!)).toBe("seafaring-4");
    expect(gameTypeOfMap(MAP_CATALOG[0]!.def)).toBe("base");
  });

  it("every map allows a single player (player counts are upper bounds)", () => {
    for (const m of MAP_CATALOG) expect(m.def.players.min).toBe(1);
    for (const s of SCENARIO_CATALOG)
      for (const def of Object.values(s.maps)) expect(def!.players.min).toBe(1);
  });
});
