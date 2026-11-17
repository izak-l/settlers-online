# 023 — Immersive board and free panning

## Goal

Address feedback #21: give the map room to move in every direction and let it fill the screen
behind the existing game controls.

## Scope / non-scope

- Work on `fix/immersive-map`, cut from `main`; expansion work remains on `m10`.
- Keep the existing players, actions, trades, log/chat, hand, sounds and navigation.
- Draw the board across the viewport, with controls in floating panels. Fit the map into the
  clear space between the overlays initially and when Fit is pressed.
- On narrow screens keep actions and information in a scrollable panel above the hand.
- Allow drag and pinch at every zoom, including fit; zoom from 0.65× to 4×.
- Keep part of the map within the clear area at pan limits. Fit always restores the map.
- No engine/server changes, new art, rule changes or expansion changes.

## Rules

Gestures do not change legal targets. Preserve the 6px drag threshold and suppress the click
ending a drag. Controls must not start board gestures. Touch dragging on the map pans;
touch scrolling within panels scrolls their contents.

## Engine changes

None.

## Server/UI changes

`GameView.tsx` supplies a measured clear area to `Board.tsx` / `useViewport.ts` so the SVG can
cover the full window while fitting around the overlays. `viewport.ts` owns the coordinate
math and generous bounded panning. `BoardControls.tsx` keeps Fit available after panning.
`styles.css` positions the existing panels over the board and contains their scrolling.

## Test plan

- Regression tests for panning at fit/minimum zoom, wide and tall windows, bounded panning,
  cursor anchored zoom, clear-area fitting, keyboard reveal and explicit Fit recovery.
- Run workspace tests, typecheck, lint and the production web build.
- Browser check at desktop and 375px: panel reachability, map panning, target clicks, zoom,
  reset, overlay scrolling and no horizontal page overflow.

## Open questions

None; the user's request authorizes this layout and interaction scope.

## Status

Shipped on `fix/immersive-map` (2026-11-16); ready for review, not deployed.

Validation: 346 tests pass, workspace typecheck and lint pass, production web build passes.
Chromium checks at 1440×900, 1024×600, 375×812 and 375×600 confirm full-screen board bounds,
pan at fit, zoom below fit, Fit reset and no horizontal overflow. Completed all 16 setup
placements with real pointer clicks; mobile panel scrolling and emulated touch pinch pass.
Physical-device touch testing remains for playtesting.
