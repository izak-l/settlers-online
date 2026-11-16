# 005 — Small screens and animations

## Goal

The game is comfortable on a laptop and still fully usable in a 375px-wide window, and the board shows what just changed.

## Scope / non-scope

**Scope**

- Responsive layout: board scales to fit, panels stack below it, tap targets at least 44px, no sideways scrolling at 375px. Topbar, home, lobby and game screens all checked.
- Animations: dice roll, a highlight on resources you just gained, newly placed pieces pop in, the robber slides to its new hex. All off under `prefers-reduced-motion`.

**Non-scope**

- Pan/zoom, bottom drawers, phone-specific features, native app. Added only if testing at 375px shows they're needed.

## Rules

- Animations are purely visual and driven by comparing the previous and current view (or by the latest events); they never delay input or the server.

## Engine changes

None.

## Server/UI changes

- `styles.css` breakpoints, `Board.tsx` (piece and robber transitions), `ActionBar.tsx` (dice), `HandPanel.tsx` (gain highlight).

## Test plan

- Manual in Chrome at 1280px and 375px wide: home, lobby, a game during setup, main step, discard, trade offer, win banner; no horizontal scroll (`document.documentElement.scrollWidth <= innerWidth`).
- Existing web tests stay green.

## Open questions

None.

## Status

In progress
