import { useEffect, useState } from "react";

/** The size the game screen is designed at (spec 232). Other windows scale it as a whole. */
export const DESIGN = { width: 1440, height: 900 };
const MAX_SCALE = 1.3;
const MIN_SCALE = 0.2;

/**
 * How much to scale the game's panels for a window of this size: the largest scale at which
 * the design still fits both ways, capped so big monitors don't get huge panels. Phones get a
 * very small UI rather than a rearranged one.
 */
export function uiScale(width: number, height: number): number {
  const fit = Math.min(width / DESIGN.width, height / DESIGN.height);
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, fit));
}

/**
 * The scale for the game frame, kept up to date as it resizes. It starts from the window size so
 * the very first layout (which the board measures to fit the map) is already scaled. The caller
 * puts it on the frame as `--ui-scale`, where the CSS and `currentUiScale` read it.
 */
export function useUiScale(frame: HTMLElement | null): number {
  const [scale, setScale] = useState(() => uiScale(window.innerWidth, window.innerHeight));
  useEffect(() => {
    if (!frame) return;
    const measure = () => {
      const r = frame.getBoundingClientRect();
      setScale(uiScale(r.width, r.height));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(frame);
    measure();
    return () => ro.disconnect();
  }, [frame]);
  return scale;
}

/** The scale in effect at `el` (1 outside the game), for things positioned in screen pixels. */
export function currentUiScale(
  el: Element | null = document.querySelector(".layout-frame"),
): number {
  const v = el ? parseFloat(getComputedStyle(el).getPropertyValue("--ui-scale")) : NaN;
  return Number.isFinite(v) && v > 0 ? v : 1;
}
