import type { Viewport } from "./useViewport";

/** Zoom buttons overlaid on the board. Wheel, drag and pinch do the same (see useViewport). */
export function BoardControls({ vp }: { vp: Viewport }) {
  return (
    <div className="board-controls" role="group" aria-label="Board zoom">
      <button aria-label="Zoom in" title="Zoom in" disabled={!vp.canZoomIn} onClick={vp.zoomIn}>
        +
      </button>
      <button aria-label="Zoom out" title="Zoom out" disabled={!vp.canZoomOut} onClick={vp.zoomOut}>
        −
      </button>
      <button aria-label="Fit the board" title="Fit the board" onClick={vp.fit}>
        ⤢
      </button>
    </div>
  );
}
