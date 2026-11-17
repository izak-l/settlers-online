import { describe, expect, it } from "vitest";
import type { BuildOption } from "@settlers/engine";
import { buildLocations, directBuild } from "./buildLocations";

describe("buildLocations", () => {
  it("groups choices by edge or corner, preserving server costs and availability", () => {
    const road: BuildOption = {
      piece: "road",
      label: "Road",
      cost: { wood: 1, brick: 1 },
      action: { type: "BUILD_ROAD", edge: "same" },
    };
    const settlement: BuildOption = {
      piece: "settlement",
      label: "Settlement",
      cost: { wood: 1 },
      action: { type: "BUILD_SETTLEMENT", vertex: "same" },
      disabledReason: { ok: false, code: "CANNOT_AFFORD", message: "Need wood" },
    };
    const city: BuildOption = {
      piece: "city",
      label: "City",
      cost: { ore: 3 },
      action: { type: "BUILD_CITY", vertex: "same" },
    };
    expect(buildLocations([road, settlement, city])).toEqual([
      { kind: "edge", id: "same", options: [road] },
      { kind: "vertex", id: "same", options: [settlement, city] },
    ]);
    expect(buildLocations([])).toEqual([]);
  });
});

describe("directBuild (spec 231)", () => {
  const roads = [
    { type: "BUILD_ROAD" as const, edge: "0,0|1,0" },
    { type: "BUILD_ROAD" as const, edge: "1,0|1,-1" },
  ];
  it("finds the chosen mode's build at the clicked location", () => {
    expect(directBuild(roads, "1,0|1,-1")).toEqual(roads[1]);
  });
  it("finds nothing elsewhere, or with no mode (no targets)", () => {
    expect(directBuild(roads, "0,0|0,1")).toBeUndefined();
    expect(directBuild([], "0,0|1,0")).toBeUndefined();
  });
});
