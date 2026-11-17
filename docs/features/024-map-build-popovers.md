# 024 — Build from map edges and corners

## Goal

Address feedback #22: during a normal turn, click an edge or corner to see the available
pieces and their costs, then confirm a build from a popup. Only valid build locations are
interactive. Valid placements that lack resources show a disabled choice with its cost.

## Scope / non-scope

- Continue client feedback work on `fix/immersive-map`, separately from `m10`.
- Road choices on connected, unoccupied edges; settlement/city choices only at valid vertices.
  Omit invalid locations and exhausted pieces. Preserve sidebar build modes.
- Keep setup placements, free roads and robber actions as direct highlighted clicks.
- Popup follows its map point when panning/zooming, stays within the clear map area, and closes
  on outside click, Escape, build submission or a changed decision/turn/seat.
- Server-generated previews update when resources or pieces change. No client legality rules.
- No seafaring code is copied from `m10`. Modules can attach build metadata to their action
  handlers; the UI renders arbitrary piece labels/costs/actions (including ships after merge).

## Rules

Popup choices are intents, validated by the authoritative server on submission. Disabled
choices do not submit. Dragging never opens a popup or confirms a build. Keyboard users can
focus map locations and open them with Enter/Space; popup buttons and dismissal are accessible.
Map focus uses the piece-shaped highlight, with no browser outline boxes. Only keyboard
dismissal returns focus to the originating location; pointer dismissal does not refocus it.

## Engine changes

Optional build metadata (piece, display label, cost) on action handlers. `buildOptions` lists
spatially valid builds for the current actor and decision. Handlers validate placement and
other restrictions before affordability. The query omits rejections other than CANNOT_AFFORD,
so insufficient resources never make an invalid edge interactive. Each option contains its
cost and any affordability rejection. Base build handlers register their costs;
legal actions, resource transfers and replay behavior remain unchanged; if both placement
and cost fail, the placement error is reported first.

## Server/UI changes

Send previews beside legal actions in game snapshots, for the viewer's own seat only; none
for spectators. LocalGame computes the same query. Board groups choices by edge/vertex and
renders invisible hit targets plus a positioned HTML popup. Retain legacy mode highlights.

## Test plan

- Engine tests first: affordable/unaffordable previews, correct costs, invalid locations,
  piece limits, off-turn/ended games, purity, enabled previews match legal actions.
- Server integration checks preview delivery and spectator filtering.
- Browser: setup direct clicks, map popup, disabled choice/cost, close/Escape/outside click,
  confirmation, drag suppression, legacy buttons, mobile placement and zoom/pan anchoring.
- Workspace typecheck, tests, lint and production web build.

## Open questions

None. After merging `m10`, register seafaring ship handler metadata using its own cost table
and include sea graph edges among that handler's candidates. No ship rule lives in the UI.

## Status

Shipped for the base game on `fix/immersive-map` (2026-11-16); not deployed.

355 workspace tests pass, including preview legality/purity and socket delivery/redaction
against both memory and Postgres stores. Typecheck, lint and production web build pass.
Chromium checks cover direct setup placement, edge and corner popups, costs, disabled/live
resource updates, road and city confirmation, zoom anchoring, Escape/focus restoration, outside dismissal, drag
suppression, sidebar build modes and popup bounds at 1440×900, 375×812 and 375×600.
Ships require metadata registration after the separate `m10` merge, as described above.

Follow-up: regression coverage excludes occupied/disconnected edges and opponent-blocked
routes even with an empty hand. Browser checks cover pointer dismissal without refocusing
the map and keyboard focus without a rectangular outline.
