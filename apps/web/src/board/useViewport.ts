import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  fitView,
  panBy,
  pxPerUnit,
  reveal,
  viewBox,
  zoomAt,
  toBoard,
  type Box,
  type Pt,
  type Size,
  type View,
} from "./viewport";

/** A press that moves less than this is a click, not a drag. */
const DRAG_PX = 6;
const BUTTON_STEP = 1.5;

export interface Viewport {
  /** Attach to the element that wraps the SVG; it's measured and receives the gestures. */
  ref: (el: HTMLDivElement | null) => void;
  viewBox: string;
  /** Pixels per board unit right now (for hit areas). */
  scale: number;
  zoom: number;
  frame: Box;
  screenPoint(p: Pt): Pt;
  canZoomIn: boolean;
  canZoomOut: boolean;
  zoomIn(): void;
  zoomOut(): void;
  fit(): void;
  /** Pan so a board point is visible (keyboard focus on a target). */
  show(p: Pt): void;
}

/**
 * Zoom and pan for the board: the mouse wheel zooms around the cursor, a drag pans at every
 * zoom, two fingers pinch. Clicks on targets still work, because a press only becomes a drag after
 * it moves DRAG_PX, and the click that ends a drag is swallowed.
 */
export function useViewport(fit: Box, fitArea: HTMLElement | null = null): Viewport {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });
  const [view, setView] = useState<View>(() => fitView(fit));

  // A new map (or a changed fit box) starts from the fit view again.
  const fitKey = `${fit.x},${fit.y},${fit.w},${fit.h}`;
  // eslint has no react-hooks plugin here; `fitKey` stands in for `fit` on purpose.
  useEffect(() => setView(fitView(fit)), [fitKey]);

  useEffect(() => {
    if (!el) return;
    const measure = () => {
      const board = el.getBoundingClientRect();
      const area = fitArea?.getBoundingClientRect() ?? board;
      setSize({
        w: Math.max(1, board.width),
        h: Math.max(1, board.height),
        frame: {
          x: area.left - board.left,
          y: area.top - board.top,
          w: Math.max(1, area.width),
          h: Math.max(1, area.height),
        },
      });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (fitArea) ro.observe(fitArea);
    measure();
    return () => ro.disconnect();
  }, [el, fitArea]);

  // Gestures read the latest values through a ref, so listeners are attached once per element.
  const latest = useRef({ fit, size, view });
  latest.current = { fit, size, view };

  useEffect(() => {
    if (!el) return;
    const local = (e: { clientX: number; clientY: number }): Pt => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const update = (f: (v: View, fit: Box, size: Size) => View) =>
      setView((v) => f(v, latest.current.fit, latest.current.size));

    const onWheel = (e: WheelEvent) => {
      if ((e.target as Element).closest("button, [data-board-ui]")) return;
      const { zoom } = latest.current.view;
      const zoomingIn = e.deltaY < 0;
      // Let the page scroll when the board can't zoom further that way.
      if ((zoomingIn && zoom >= MAX_ZOOM) || (!zoomingIn && zoom <= MIN_ZOOM)) return;
      e.preventDefault();
      const at = local(e);
      const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015));
      update((v, f, s) => zoomAt(v, f, s, at, factor));
    };

    const pointers = new Map<number, Pt>();
    let dragging = false;
    let start: Pt | null = null;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || (e.target as Element).closest("button, [data-board-ui]")) return;
      pointers.set(e.pointerId, local(e));
      if (pointers.size === 1) {
        start = local(e);
        dragging = false;
      }
    };
    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const now = local(e);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const other = a === prev ? b! : a!;
        const before = Math.hypot(prev.x - other.x, prev.y - other.y);
        const after = Math.hypot(now.x - other.x, now.y - other.y);
        const mid = { x: (now.x + other.x) / 2, y: (now.y + other.y) / 2 };
        dragging = true;
        if (before > 0) update((v, f, s) => zoomAt(v, f, s, mid, after / before));
        update((v, f, s) => panBy(v, f, s, { x: (now.x - prev.x) / 2, y: (now.y - prev.y) / 2 }));
      } else if (pointers.size === 1 && start) {
        if (!dragging && Math.hypot(now.x - start.x, now.y - start.y) >= DRAG_PX) {
          dragging = true;
          el.setPointerCapture(e.pointerId);
        }
        if (dragging) update((v, f, s) => panBy(v, f, s, { x: now.x - prev.x, y: now.y - prev.y }));
      }
      pointers.set(e.pointerId, now);
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      if (pointers.size === 0) start = null;
    };
    // The click at the end of a drag or pinch must not place a piece.
    const onClick = (e: MouseEvent) => {
      if (dragging && !(e.target as Element).closest("button, [data-board-ui]")) {
        e.stopPropagation();
        e.preventDefault();
        dragging = false;
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("click", onClick, true);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("click", onClick, true);
    };
  }, [el]);

  const centre = (): Pt => {
    const f = size.frame ?? { x: 0, y: 0, w: size.w, h: size.h };
    return { x: f.x + f.w / 2, y: f.y + f.h / 2 };
  };
  const ready = size.w > 0 && size.h > 0;
  // Before the first measurement, show the fit box itself.
  const box = ready ? viewBox(view, fit, size) : [fit.x, fit.y, fit.w, fit.h];

  return {
    ref: useCallback((node: HTMLDivElement | null) => setEl(node), []),
    viewBox: box.map((n) => n.toFixed(2)).join(" "),
    scale: ready ? pxPerUnit(view, fit, size) : 1,
    zoom: view.zoom,
    frame: size.frame ?? { x: 0, y: 0, w: size.w, h: size.h },
    screenPoint: (p) => {
      if (!ready) return { x: 0, y: 0 };
      const origin = toBoard(view, fit, size, { x: 0, y: 0 });
      const scale = pxPerUnit(view, fit, size);
      return { x: (p.x - origin.x) * scale, y: (p.y - origin.y) * scale };
    },
    canZoomIn: view.zoom < MAX_ZOOM,
    canZoomOut: view.zoom > MIN_ZOOM,
    zoomIn: () => ready && setView((v) => zoomAt(v, fit, size, centre(), BUTTON_STEP)),
    zoomOut: () => ready && setView((v) => zoomAt(v, fit, size, centre(), 1 / BUTTON_STEP)),
    fit: () => setView(fitView(fit)),
    show: (p) => ready && setView((v) => reveal(v, fit, size, p)),
  };
}
