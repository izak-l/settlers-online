import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_ZOOM,
  fitView,
  panBy,
  pxPerUnit,
  reveal,
  viewBox,
  zoomAt,
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
  canZoomIn: boolean;
  canZoomOut: boolean;
  zoomIn(): void;
  zoomOut(): void;
  fit(): void;
  /** Pan so a board point is visible (keyboard focus on a target). */
  show(p: Pt): void;
}

/**
 * Zoom and pan for the board: the mouse wheel zooms around the cursor, a drag pans when zoomed
 * in, two fingers pinch. Clicks on targets still work, because a press only becomes a drag after
 * it moves DRAG_PX, and the click that ends a drag is swallowed.
 */
export function useViewport(fit: Box): Viewport {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState<Size>({ w: 0, h: 0 });
  const [view, setView] = useState<View>(() => fitView(fit));

  // A new map (or a changed fit box) starts from the fit view again.
  const fitKey = `${fit.x},${fit.y},${fit.w},${fit.h}`;
  // eslint has no react-hooks plugin here; `fitKey` stands in for `fit` on purpose.
  useEffect(() => setView(fitView(fit)), [fitKey]);

  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry!.contentRect;
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);

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
      const { zoom } = latest.current.view;
      const zoomingIn = e.deltaY < 0;
      // Let the page scroll when the board can't zoom further that way.
      if ((zoomingIn && zoom >= MAX_ZOOM) || (!zoomingIn && zoom <= 1)) return;
      e.preventDefault();
      const at = local(e);
      const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015));
      update((v, f, s) => zoomAt(v, f, s, at, factor));
    };

    const pointers = new Map<number, Pt>();
    let dragging = false;
    let start: Pt | null = null;

    const onDown = (e: PointerEvent) => {
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
      } else if (pointers.size === 1 && latest.current.view.zoom > 1 && start) {
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
      if (pointers.size === 0) start = null;
    };
    // The click at the end of a drag or pinch must not place a piece.
    const onClick = (e: MouseEvent) => {
      if (dragging) {
        e.stopPropagation();
        e.preventDefault();
        dragging = false;
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("click", onClick, true);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("click", onClick, true);
    };
  }, [el]);

  const centre = (): Pt => ({ x: size.w / 2, y: size.h / 2 });
  const ready = size.w > 0 && size.h > 0;
  // Before the first measurement, show the fit box itself.
  const box = ready ? viewBox(view, fit, size) : [fit.x, fit.y, fit.w, fit.h];

  return {
    ref: useCallback((node: HTMLDivElement | null) => setEl(node), []),
    viewBox: box.map((n) => n.toFixed(2)).join(" "),
    scale: ready ? pxPerUnit(view, fit, size) : 1,
    zoom: view.zoom,
    canZoomIn: view.zoom < MAX_ZOOM,
    canZoomOut: view.zoom > 1,
    zoomIn: () => setView((v) => zoomAt(v, fit, size, centre(), BUTTON_STEP)),
    zoomOut: () => setView((v) => zoomAt(v, fit, size, centre(), 1 / BUTTON_STEP)),
    fit: () => setView(fitView(fit)),
    show: (p) => ready && setView((v) => reveal(v, fit, size, p)),
  };
}
