import { useLayoutEffect, useRef, useState } from "react";
import type { Action, BuildOption } from "@settlers/engine";
import { Icon } from "../art/icons";
import type { Box, Pt } from "./viewport";

/** A map-anchored confirmation, kept inside the clear area between the floating panels. */
export function BuildPopover({
  options,
  at,
  frame,
  onBuild,
  onClose,
}: {
  options: BuildOption[];
  at: Pt;
  frame: Box;
  onBuild(action: Action): void;
  onClose(restoreFocus?: boolean): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(180);
  const width = Math.min(280, Math.max(140, frame.w - 16));
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setHeight(el.getBoundingClientRect().height));
    observer.observe(el);
    // Keep the popup keyboard reachable even when every build is disabled.
    el.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
    return () => observer.disconnect();
  }, []);
  const left = Math.max(frame.x + 4, Math.min(at.x - width / 2, frame.x + frame.w - width - 4));
  const preferredTop = at.y - height - 16 >= frame.y ? at.y - height - 16 : at.y + 16;
  const top = Math.max(frame.y + 4, Math.min(preferredTop, frame.y + frame.h - height - 4));

  return (
    <div
      ref={ref}
      className="build-popover panel"
      role="dialog"
      aria-label="Build here"
      data-board-ui
      style={{ left, top, width, maxHeight: Math.max(80, frame.h - 8) }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose(true);
        }
      }}
    >
      <div className="build-popover-head">
        <strong>Build here</strong>
        <button className="icon-button" aria-label="Close build menu" onClick={() => onClose()}>
          ×
        </button>
      </div>
      {[...options]
        .sort((a, b) => Number(!!a.disabledReason) - Number(!!b.disabledReason))
        .map((option) => {
          const reasonId = `build-reason-${option.piece}`;
          return (
            <div className="build-choice" key={option.action.type}>
              <button
                className="build-choice-button"
                disabled={!!option.disabledReason}
                aria-describedby={option.disabledReason ? reasonId : undefined}
                onClick={() => onBuild(option.action)}
              >
                <Icon name={option.piece} size={28} />
                <span>{option.label}</span>
                <span
                  className="cost"
                  role="img"
                  aria-label={Object.entries(option.cost)
                    .map(([r, n]) => `${n} ${r}`)
                    .join(", ")}
                >
                  {Object.entries(option.cost).map(([resource, count]) => (
                    <span
                      key={resource}
                      className={`chip res-${resource}`}
                      title={`${count} ${resource}`}
                    >
                      <Icon name={resource} size={16} />
                      <span>{count}</span>
                    </span>
                  ))}
                </span>
              </button>
              {option.disabledReason && (
                <p id={reasonId} className="muted small">
                  {option.disabledReason.message}
                </p>
              )}
            </div>
          );
        })}
    </div>
  );
}
