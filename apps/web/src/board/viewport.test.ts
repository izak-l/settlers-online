import { describe, it, expect } from "vitest";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  measuredSize,
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
  it("keeps zoom and position steady when stealing or card motion changes overlay size", () => {
    const initial = measuredSize(
      { w: 0, h: 0 },
      {
        w: 1440,
        h: 900,
        frame: { x: 16, y: 80, w: 1040, h: 600 },
      },
    );
    const expandedHand = measuredSize(initial, {
      w: 1440,
      h: 900,
      frame: { x: 16, y: 80, w: 1040, h: 480 },
    });
    const settledHand = measuredSize(expandedHand, {
      w: 1440,
      h: 900,
      frame: { x: 16, y: 80, w: 1040, h: 640 },
    });
    for (const v of [fitView(fit), { zoom: 2, cx: 50, cy: -20 }]) {
      expect(viewBox(v, fit, expandedHand)).toEqual(viewBox(v, fit, initial));
      expect(viewBox(v, fit, settledHand)).toEqual(viewBox(v, fit, initial));
      expect(pxPerUnit(v, fit, settledHand)).toBe(pxPerUnit(v, fit, initial));
    }
    // Explicit Fit uses the current clear area; a genuine viewport resize refits too.
    const refitted = { ...settledHand, fitFrame: settledHand.frame! };
    expect(pxPerUnit(fitView(fit), fit, refitted)).toBeCloseTo(640 / 500);
    const resized = measuredSize(settledHand, {
      w: 375,
      h: 812,
      frame: { x: 16, y: 80, w: 343, h: 300 },
    });
    expect(resized.fitFrame).toEqual(resized.frame);
    expect(pxPerUnit(fitView(fit), fit, resized)).toBeCloseTo(343 / 600);
  });

  it("uses the current clear area for keyboard reveal after overlays resize", () => {
    const screen = {
      w: 1440,
      h: 900,
      fitFrame: { x: 16, y: 80, w: 1040, h: 600 },
      frame: { x: 16, y: 80, w: 1040, h: 300 },
    };
    const before = fitView(fit);
    const target = { x: 0, y: 180 };
    const revealed = reveal(before, fit, screen, target);
    const centre = toBoard(revealed, fit, screen, { x: 536, y: 230 });
    expect(centre.x).toBeCloseTo(target.x);
    expect(centre.y).toBeCloseTo(target.y);
    const cursor = { x: 400, y: 200 };
    const point = toBoard(before, fit, screen, cursor);
    const zoomed = zoomAt(before, fit, screen, cursor, 1.5);
    expect(toBoard(zoomed, fit, screen, cursor).x).toBeCloseTo(point.x);
    expect(toBoard(zoomed, fit, screen, cursor).y).toBeCloseTo(point.y);
  });

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

  it("clamps zoom between the extra zoom-out range and the maximum", () => {
    const v = fitView(fit);
    expect(zoomAt(v, fit, size, { x: 600, y: 400 }, 0.01).zoom).toBe(MIN_ZOOM);
    expect(zoomAt(v, fit, size, { x: 600, y: 400 }, 100).zoom).toBe(MAX_ZOOM);
  });

  it.each([
    { w: 1600, h: 700 },
    { w: 375, h: 812 },
  ])("pans freely on both axes at fit and minimum zoom in $w × $h", (screen) => {
    for (const zoom of [1, MIN_ZOOM]) {
      const v = { ...fitView(fit), zoom };
      const moved = panBy(v, fit, screen, { x: 100, y: -100 });
      const scale = pxPerUnit(v, fit, screen);
      expect(moved.cx).toBeCloseTo(v.cx - 100 / scale);
      expect(moved.cy).toBeCloseTo(v.cy + 100 / scale);
    }
  });

  it("keeps part of the map visible at every pan limit", () => {
    for (const zoom of [MIN_ZOOM, 1, MAX_ZOOM]) {
      for (const sign of [-1, 1]) {
        const far = panBy({ ...fitView(fit), zoom }, fit, size, {
          x: sign * 100000,
          y: sign * 100000,
        });
        const [x, y, w, h] = viewBox(far, fit, size);
        const overlapX = Math.min(x + w, fit.x + fit.w) - Math.max(x, fit.x);
        const overlapY = Math.min(y + h, fit.y + fit.h) - Math.max(y, fit.y);
        expect(overlapX).toBeCloseTo(Math.min(w, fit.w) * 0.2);
        expect(overlapY).toBeCloseTo(Math.min(h, fit.h) * 0.2);
      }
    }
  });

  it("preserves position when zooming out; explicit Fit restores the original view", () => {
    const moved = panBy(fitView(fit), fit, size, { x: 200, y: 100 });
    const zoomed = zoomAt(moved, fit, size, { x: 600, y: 400 }, 2);
    expect(zoomAt(zoomed, fit, size, { x: 600, y: 400 }, 0.5)).toEqual(moved);
    expect(fitView(fit)).toEqual({ zoom: 1, cx: 0, cy: 0 });
  });

  it("fits inside the clear area while the SVG covers the entire screen", () => {
    const screen = { w: 1440, h: 900, frame: { x: 16, y: 80, w: 1040, h: 600 } };
    const v = fitView(fit);
    const scale = pxPerUnit(v, fit, screen);
    const [x, y, w, h] = viewBox(v, fit, screen);
    expect(w / h).toBeCloseTo(screen.w / screen.h);
    expect((fit.x - x) * scale).toBeGreaterThanOrEqual(screen.frame.x);
    expect((fit.y - y) * scale).toBeGreaterThanOrEqual(screen.frame.y);
    expect((fit.x + fit.w - x) * scale).toBeLessThanOrEqual(1056);
    expect((fit.y + fit.h - y) * scale).toBeCloseTo(680);
    const at = { x: 300, y: 200 };
    const before = toBoard(v, fit, screen, at);
    const after = toBoard(zoomAt(v, fit, screen, at, 2), fit, screen, at);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    const panned = panBy(v, fit, screen, { x: -10000, y: -10000 });
    const revealed = reveal(panned, fit, screen, { x: 0, y: 0 });
    expect(revealed.cx).toBe(0);
    expect(revealed.cy).toBe(0);
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
