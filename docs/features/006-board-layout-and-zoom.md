# 006 — Board layout, resize and zoom

## Goal

The board fills whatever space the window gives it, from a 375px phone to a large desktop, and players can zoom in and pan around it. Tap targets stay comfortable at every zoom.

## Scope / non-scope

**Scope**

- The game screen fills the window height (`100dvh` minus the top bar) instead of a capped, centred 1280px column. The board takes all the space the panels don't.
- The layout keeps its current shape: the board column plus one side column (`clamp(300px, 24vw, 380px)`), stacking below 860px as in M6. On wide screens the board column takes all the extra width; the 1280px cap is removed. The hand dock (spec 007) sits under the board in the board column; below 860px it comes right after the action bar and scrolls with the page.
- The board's height is the window height minus the top bar and the hand dock on desktop, and `min(62dvh, what its aspect needs)` below 860px.
- Zoom and pan are the way to see more detail and are what make larger maps (M8) workable: the fit view shows the whole map, and players zoom and drag to look around.
- Zoom: + / − / fit buttons on the board, the mouse wheel (zooms around the cursor), and pinch on touch screens. Zoom ranges from fit (1×) to 4×.
- Pan: drag the board when zoomed in. At 1× there is nothing to pan, so on phones a one-finger drag still scrolls the page.
- The board can't be panned so far that the land leaves the view.
- Tap targets: hit areas are sized in screen pixels, not board units, so they don't shrink when the board is small. They are capped so neighbouring targets never overlap.
- Keyboard: zoom buttons are normal buttons. When a board target gets focus and is outside the zoomed view, the view pans to show it.

**Non-scope**

- Rotating the board, minimap, saving a zoom level between games.
- Pan or zoom gesture libraries (see Server/UI changes).

## Rules

- Pure UI. Targets still come only from `legal`; zoom and pan never change what can be clicked, only how big it is.
- A tap that moves less than 6px is a click, not a pan, so placing pieces works the same when zoomed.
- Zoom is per browser tab and resets to fit when the game is opened.

## Engine changes

None.

## Server/UI changes

- `apps/web/src/board/viewport.ts` (new, pure): the fit box from the map, `zoomAt(viewport, point, factor)`, `panBy`, clamping zoom to [1, 4] and the centre to the land's bounds, and `hitRadius(pxPerUnit)`. Unit-tested.
- `apps/web/src/board/useViewport.ts` (new): a `ResizeObserver` gives the board's pixel size; pointer events handle drag and two-pointer pinch; the wheel zooms. It outputs the `viewBox` string and pixels per board unit.
- `apps/web/src/board/BoardControls.tsx` (new): the + / − / fit buttons, overlaid in a corner of the board.
- `Board.tsx`: uses the viewport `viewBox`, `preserveAspectRatio="xMidYMid meet"` at 100% width and height of its container, and computes hit radii from `hitRadius`. `touch-action: none` only while zoomed in.
- `GameView.tsx` + `styles.css`: a full-height grid (`board`, `hand`, `side`). This replaces the `max-width: 1280px`, the fixed 340px sidebar and the board's `max-height`.
- **No new dependency.** Wheel, drag and pinch fit in about 150 lines of pointer-event code. A gesture library would mostly bring features we don't use, and it would sit in the middle of the target clicks we need to keep exact.

## Test plan

- `viewport.test.ts`: fit at 1×; zooming around a point keeps that point still on screen; zoom clamps at 1 and 4; panning can't push the land out of view; zooming out to 1× re-centres; hit radii are at least 22 screen px and never more than half the vertex spacing.
- Manual in Chrome: a 375px iframe, the normal window, and a 2560×1440 iframe scaled down to check the board takes the extra width. Wheel, drag and buttons work; pinch is checked with the device toolbar's touch emulation if possible, otherwise in the playtest. No sideways page scroll at 375px. Keyboard Tab through targets while zoomed pans to them.
- Existing web tests stay green.

## Open questions

None. (Decided: at 375px and 1× hit areas can't reach 44px without overlapping; we accept that, as zooming in solves it. No auto-zoom.)

## Status

Shipped
