import { describe, it, expect } from "vitest";
import {
  MAX_ZOOM,
  fitView,
  hitRadius,
  panBy,
  pxPerUnit,
  reveal,
  toBoard,
  viewBox,
  zoomAt,
  type Box,
  type Size,
} from "./viewport";

const fit: Box = { x: -300, y: -250, w: 600, h: 500 };
const size: Size = { w: 1200, h: 800 };

describe("viewport", () => {
  it("fits the whole box at zoom 1, centred, filling the container's aspect", () => {
    const v = fitView(fit);
    expect(v.zoom).toBe(1);
    expect(pxPerUnit(v, fit, size)).toBe(1.6); // limited by height: 800 / 500
    const [x, y, w, h] = viewBox(v, fit, size);
    expect(w / h).toBeCloseTo(size.w / size.h);
    expect(x + w / 2).toBeCloseTo(0);
    expect(y + h / 2).toBeCloseTo(0);
    expect(w).toBeGreaterThanOrEqual(fit.w);
    expect(h).toBeCloseTo(fit.h);
  });

  it("keeps the point under the cursor still while zooming", () => {
    const at = { x: 900, y: 300 };
    const before = toBoard(fitView(fit), fit, size, at);
    const v = zoomAt(fitView(fit), fit, size, at, 2);
    expect(v.zoom).toBe(2);
    const after = toBoard(v, fit, size, at);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("clamps zoom between fit and the maximum", () => {
    const v = fitView(fit);
    expect(zoomAt(v, fit, size, { x: 600, y: 400 }, 0.5).zoom).toBe(1);
    expect(zoomAt(v, fit, size, { x: 600, y: 400 }, 100).zoom).toBe(MAX_ZOOM);
  });

  it("can't pan the land out of view", () => {
    const v = zoomAt(fitView(fit), fit, size, { x: 600, y: 400 }, 2);
    const far = panBy(v, fit, size, { x: -100000, y: -100000 });
    const [x, y, w, h] = viewBox(far, fit, size);
    expect(x + w).toBeCloseTo(fit.x + fit.w);
    expect(y + h).toBeCloseTo(fit.y + fit.h);
  });

  it("has nothing to pan at zoom 1", () => {
    const v = panBy(fitView(fit), fit, size, { x: 200, y: 200 });
    expect(v).toEqual(fitView(fit));
  });

  it("re-centres when zooming back out to fit", () => {
    let v = zoomAt(fitView(fit), fit, size, { x: 1100, y: 700 }, 3);
    v = zoomAt(v, fit, size, { x: 100, y: 100 }, 1 / 3);
    expect(v).toEqual(fitView(fit));
  });

  it("reveals a point outside the view by centring on it", () => {
    const v = zoomAt(fitView(fit), fit, size, { x: 600, y: 400 }, 4);
    const r = reveal(v, fit, size, { x: 200, y: 150 });
    expect(r.cx).toBeCloseTo(200);
    expect(r.cy).toBeCloseTo(150);
    // Already visible: unchanged.
    expect(reveal(v, fit, size, { x: 0, y: 0 })).toEqual(v);
  });

  it("sizes hit areas in screen pixels, capped below half the vertex spacing", () => {
    // Small board: as big as allowed without overlapping neighbours (60-unit spacing).
    expect(hitRadius(0.5)).toBe(28);
    // Normal board: 22 screen px.
    expect(hitRadius(1) * 1).toBe(22);
    expect(hitRadius(2) * 2).toBeCloseTo(22);
    for (const ppu of [0.3, 0.6, 1, 2, 4, 8]) expect(hitRadius(ppu)).toBeLessThan(30);
  });
});
