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
  /** Unobstructed screen rectangle; the SVG itself still fills w × h. */
  frame?: Box;
  /** Clear area captured at initial fit, resize or explicit Fit; overlays may change independently. */
  fitFrame?: Box;
  /** The panels' scale (spec 232). A new scale moves every panel, so it refits like a resize. */
  uiScale?: number;
}
export interface Pt {
  x: number;
  y: number;
}
/** Zoom 1 shows the whole fit box; (cx, cy) is the board point at the centre of the clear area. */
export interface View {
  zoom: number;
  cx: number;
  cy: number;
}

export const MIN_ZOOM = 0.65;
export const MAX_ZOOM = 4;

function frameOf(size: Size): Box {
  return size.frame ?? { x: 0, y: 0, w: size.w, h: size.h };
}

function fitFrameOf(size: Size): Box {
  return size.fitFrame ?? frameOf(size);
}

/** Keep the camera's fit reference while only overlays change; refit on container resize. */
export function measuredSize(previous: Size, next: Size): Size {
  const sameViewport =
    previous.w === next.w && previous.h === next.h && previous.uiScale === next.uiScale;
  return { ...next, fitFrame: sameViewport ? fitFrameOf(previous) : frameOf(next) };
}

export function fitView(fit: Box): View {
  return { zoom: 1, cx: fit.x + fit.w / 2, cy: fit.y + fit.h / 2 };
}

/** Pixels per board unit at this zoom. */
export function pxPerUnit(v: View, fit: Box, size: Size): number {
  const frame = fitFrameOf(size);
  const base = Math.min(frame.w / fit.w, frame.h / fit.h);
  return base * v.zoom;
}

/** [x, y, width, height] for the SVG viewBox. */
export function viewBox(v: View, fit: Box, size: Size): [number, number, number, number] {
  const s = pxPerUnit(v, fit, size);
  const w = size.w / s;
  const h = size.h / s;
  const frame = fitFrameOf(size);
  return [v.cx - (frame.x + frame.w / 2) / s, v.cy - (frame.y + frame.h / 2) / s, w, h];
}

/** The board point under a screen point. */
export function toBoard(v: View, fit: Box, size: Size, p: Pt): Pt {
  const [x, y] = viewBox(v, fit, size);
  const s = pxPerUnit(v, fit, size);
  return { x: x + p.x / s, y: y + p.y / s };
}

/** Allow broad movement while keeping at least 20% of each map/view axis in the clear area. */
function clamp(v: View, fit: Box, size: Size): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom));
  const s = pxPerUnit({ ...v, zoom }, fit, size);
  const frame = frameOf(size);
  const anchor = fitFrameOf(size);
  const dx = (frame.x + frame.w / 2 - (anchor.x + anchor.w / 2)) / s;
  const dy = (frame.y + frame.h / 2 - (anchor.y + anchor.h / 2)) / s;
  const axis = (c: number, start: number, len: number, viewLen: number) => {
    const overlap = Math.min(len, viewLen) * 0.2;
    return Math.min(
      start + len + viewLen / 2 - overlap,
      Math.max(start - viewLen / 2 + overlap, c),
    );
  };
  return {
    zoom,
    cx: axis(v.cx + dx, fit.x, fit.w, frame.w / s) - dx,
    cy: axis(v.cy + dy, fit.y, fit.h, frame.h / s) - dy,
  };
}

/** Zoom by `factor` around a screen point, which stays over the same board point. */
export function zoomAt(v: View, fit: Box, size: Size, at: Pt, factor: number): View {
  const p = toBoard(v, fit, size, at);
  const frame = fitFrameOf(size);
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor));
  const s = pxPerUnit({ ...v, zoom }, fit, size);
  return clamp(
    {
      zoom,
      cx: p.x - (at.x - (frame.x + frame.w / 2)) / s,
      cy: p.y - (at.y - (frame.y + frame.h / 2)) / s,
    },
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
  const frame = frameOf(size);
  const { x, y } = toBoard(v, fit, size, frame);
  const s = pxPerUnit(v, fit, size);
  const w = frame.w / s;
  const h = frame.h / s;
  const m = Math.min(marginPx / s, w / 4, h / 4);
  const inside = p.x >= x + m && p.x <= x + w - m && p.y >= y + m && p.y <= y + h - m;
  const anchor = fitFrameOf(size);
  return inside
    ? v
    : clamp(
        {
          ...v,
          cx: p.x - (frame.x + frame.w / 2 - (anchor.x + anchor.w / 2)) / s,
          cy: p.y - (frame.y + frame.h / 2 - (anchor.y + anchor.h / 2)) / s,
        },
        fit,
        size,
      );
}

/** Wanted size of a target's hit area, in screen pixels (a 44px circle). */
const HIT_PX = 22;
/** Neighbouring vertices are HEX_SIZE apart; stay under half that so hit areas never overlap. */
const HIT_MAX = HEX_SIZE / 2 - 2;

/** Hit-area radius in board units: 22 screen px when there's room, never overlapping. */
export function hitRadius(pxPerUnitNow: number): number {
  return Math.min(HIT_MAX, HIT_PX / pxPerUnitNow);
}
