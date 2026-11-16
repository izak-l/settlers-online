import { describe, expect, it } from "vitest";
import { BASE_FEATURES } from "@settlers/engine";
import { featureSummary, toggleRule } from "./features";

describe("house rules", () => {
  it("summarises switched-off features, or nothing when all are on", () => {
    expect(featureSummary(BASE_FEATURES)).toBeNull();
    expect(featureSummary({ ...BASE_FEATURES, devCards: false, longestRoad: false })).toBe(
      "No development cards, no Longest Road",
    );
  });

  it("keeps only switches that differ from the map", () => {
    expect(toggleRule(BASE_FEATURES, {}, "robber", false)).toEqual({ robber: false });
    expect(toggleRule(BASE_FEATURES, { robber: false }, "robber", true)).toEqual({});
    const mapOff = { ...BASE_FEATURES, ports: false };
    expect(toggleRule(mapOff, {}, "ports", true)).toEqual({ ports: true });
  });
});
