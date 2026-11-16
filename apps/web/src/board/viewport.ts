/**
 * Pure zoom and pan maths for the board. Board units are the SVG units of `geometry.ts`;
 * screen points are pixels relative to the board's container.
 *
 * The viewBox always has the container's aspect ratio, so one board unit is the same number of
 * pixels across and down, and screen ↔ board conversion is a plain scale plus offset.
 */
import { HEX_SIZE } from "./geometry";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Size {
  w: number;
  h: number;
}
export interface Pt {
  x: number;
  y: number;
}
/** Zoom 1 shows the whole fit box; (cx, cy) is the board point at the centre of the view. */
export interface View {
  zoom: number;
  cx: number;
  cy: number;
}

export const MAX_ZOOM = 4;

export function fitView(fit: Box): View {
  return { zoom: 1, cx: fit.x + fit.w / 2, cy: fit.y + fit.h / 2 };
}

/** Pixels per board unit at this zoom. */
export function pxPerUnit(v: View, fit: Box, size: Size): number {
  const base = Math.min(size.w / fit.w, size.h / fit.h);
  return base * v.zoom;
}

/** [x, y, width, height] for the SVG viewBox. */
export function viewBox(v: View, fit: Box, size: Size): [number, number, number, number] {
  const s = pxPerUnit(v, fit, size);
  const w = size.w / s;
  const h = size.h / s;
  return [v.cx - w / 2, v.cy - h / 2, w, h];
}

/** The board point under a screen point. */
export function toBoard(v: View, fit: Box, size: Size, p: Pt): Pt {
  const [x, y] = viewBox(v, fit, size);
  const s = pxPerUnit(v, fit, size);
  return { x: x + p.x / s, y: y + p.y / s };
}

/** Keep the fit box covering the view: along an axis where the view is bigger, centre it. */
function clamp(v: View, fit: Box, size: Size): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, v.zoom));
  const s = pxPerUnit({ ...v, zoom }, fit, size);
  const axis = (c: number, start: number, len: number, viewLen: number) =>
    viewLen >= len
      ? start + len / 2
      : Math.min(start + len - viewLen / 2, Math.max(start + viewLen / 2, c));
  return {
    zoom,
    cx: axis(v.cx, fit.x, fit.w, size.w / s),
    cy: axis(v.cy, fit.y, fit.h, size.h / s),
  };
}

/** Zoom by `factor` around a screen point, which stays over the same board point. */
export function zoomAt(v: View, fit: Box, size: Size, at: Pt, factor: number): View {
  const p = toBoard(v, fit, size, at);
  const zoom = Math.min(MAX_ZOOM, Math.max(1, v.zoom * factor));
  const s = pxPerUnit({ ...v, zoom }, fit, size);
  return clamp(
    { zoom, cx: p.x - (at.x - size.w / 2) / s, cy: p.y - (at.y - size.h / 2) / s },
    fit,
    size,
  );
}

/** Drag the board by a screen delta (the content follows the pointer). */
export function panBy(v: View, fit: Box, size: Size, d: Pt): View {
  const s = pxPerUnit(v, fit, size);
  return clamp({ ...v, cx: v.cx - d.x / s, cy: v.cy - d.y / s }, fit, size);
}

/** If a board point is outside the view (with a margin), centre on it. */
export function reveal(v: View, fit: Box, size: Size, p: Pt, marginPx = 32): View {
  const [x, y, w, h] = viewBox(v, fit, size);
  const m = marginPx / pxPerUnit(v, fit, size);
  const inside = p.x >= x + m && p.x <= x + w - m && p.y >= y + m && p.y <= y + h - m;
  return inside ? v : clamp({ ...v, cx: p.x, cy: p.y }, fit, size);
}

/** Wanted size of a target's hit area, in screen pixels (a 44px circle). */
const HIT_PX = 22;
/** Neighbouring vertices are HEX_SIZE apart; stay under half that so hit areas never overlap. */
const HIT_MAX = HEX_SIZE / 2 - 2;

/** Hit-area radius in board units: 22 screen px when there's room, never overlapping. */
export function hitRadius(pxPerUnitNow: number): number {
  return Math.min(HIT_MAX, HIT_PX / pxPerUnitNow);
}
