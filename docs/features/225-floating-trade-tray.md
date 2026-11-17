# 225 — Floating trade tray

## Goal

Show the full bank/player trade interface without a scrollbar whenever the viewport has room,
while keeping the player's hand visible and usable over the immersive map.

## Scope / non-scope

- Trial change on `fix/immersive-map`, after checkpoint commit `0519580` (specs 223–224).
- Bank and player offer trays float above the hand, growing to their natural content height.
- Measure space below navigation and above the hand; update on resize/browser zoom.
- If content exceeds that space, scroll only the selections/resource choices. Keep the title,
  instructions and confirmation/cancel controls outside the scrolling area.
- Preserve trade behavior, card picking, cancellation and the full-screen board.
- Discard and development-card pickers retain their current placement.
- No engine, server or protocol changes.

## Rules

Cards in the hand must remain clickable while a trade is open. Trade selections must survive
window resizing. The tray must fit horizontally and avoid covering navigation. Scrolling is
allowed when the screen cannot accommodate its contents.

## Engine changes

None.

## Server/UI changes

`cards/HandDock.tsx`: render bank/offer trays in a portal outside the height-capped hand panel.
Measure the hand and navigation to position and constrain the tray. `styles.css`: natural-height
floating tray with a scrollable body and stationary header/footer. Document the trial in
CLAUDE.md and DESIGN.md.

## Test plan

Browser-check both trade types at desktop/mobile sizes and reduced CSS viewport dimensions
representing browser zoom. Verify no scrollbar when the contents fit, fallback scrolling with
large selections, accessible Confirm/Cancel, hand picking, bank submission, cancellation,
resize preservation, no horizontal overflow and unchanged non-trade picker placement.
Run workspace typecheck, tests, lint and production build.

## Open questions

None. The user approved keeping the layout after review.

## Status

Shipped on `fix/immersive-map`; approved by the user on 2026-11-16. Committed separately
from checkpoint `0519580`. Not deployed.

355 workspace tests, typecheck, lint and production build pass. Chromium checks confirm
both trade types have no scrollbar at 1440×900, 1024×600, 375×812 and 375×600. At 720×450
and with a large offer, only the body scrolls; title/actions remain visible, with no horizontal
page overflow. Hand card picking, bank submission, cancellation and selections surviving a
resize pass. Reduced viewport dimensions approximate available space at higher browser zoom;
physical-device and actual browser zoom checks remain for playtesting.
