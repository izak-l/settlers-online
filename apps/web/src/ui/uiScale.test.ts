import { describe, expect, it } from "vitest";
import { uiScale } from "./uiScale";

describe("uiScale (spec 232)", () => {
  it("is 1 at the design size", () => {
    expect(uiScale(1440, 900)).toBe(1);
  });
  it("fits the tighter direction", () => {
    expect(uiScale(1280, 720)).toBeCloseTo(0.8); // height-bound laptop
    expect(uiScale(1000, 900)).toBeCloseTo(1000 / 1440); // narrow window
  });
  it("caps big monitors and tiny phones", () => {
    expect(uiScale(3840, 2160)).toBe(1.3);
    expect(uiScale(100, 100)).toBe(0.2);
  });
  it("scales a portrait phone down rather than rearranging", () => {
    expect(uiScale(390, 844)).toBeCloseTo(390 / 1440);
  });
});
