# 232 Action dock: a bottom bar with icon buttons and pieces left

## Goal

Make taking an action quicker to find and nicer to look at. The actions sit next to your
cards at the bottom of the screen instead of in the side column. Each build button shows an
icon and how many of that piece you have left.

## Scope / non-scope

In scope (revised after the first pass, from a reference layout the user shared; we take the
layout only, with our own art, colours and icons):

- A bottom bar, centred under the map: the hand on the left (cards splayed in a fan, as
  before; up to 520px wide), then the action dock.
- Action dock: a status line ("Your turn: …", the current prompt, or who we're waiting for)
  with the clock beside it; a card above it only when a decision needs buttons (steal, trade
  offer, road or ship, sending the pirate away, errors); and a row of icon buttons with their
  cost underneath: Trade, Road, Settlement, City, (Ship, Move ship), Dev card, (Place harbor).
- Cards flying into the hand start exactly on their source (the bank panel or a player), and
  nothing in the game screen can make the page scroll (`.layout-frame` clips), so a fly-in
  never flashes a scrollbar.
- The status line never widens the bar: a longer prompt wraps and the line grows upward
  over the map, keeping the bar's size. The road-or-ship card only appears when both are
  possible.
- A column to the right: the dice over a big End turn button, which becomes Roll dice on
  your roll step.
- The bar has a fixed height, the same for the hand and the status + buttons stack. The map
  re-fits whenever the space above the bar changes, so anything that comes and goes (the
  prompt card, menus, picking trays, the open dev card, flying cards) floats over the map
  and gaining or spending cards never moves the view.
- Build buttons carry a "left" badge: the limit minus pieces on the board (road 15,
  settlement 5, city 4, ship 15 in seafaring games); the dev card button shows the cards left
  in the deck (25 at the start). Hover or keyboard focus shows the name and cost.
- One trade window: the Trade button opens it, and so does tapping a resource card in your
  hand on your main step (that card starts as "give"). Pick what you give and want, then
  choose "Offer to players" or "Trade with bank"; the bank button works only for exactly your
  rate of one resource for one card, and the window states the rule otherwise. The side
  column's trade panel is gone.
- On your roll step the dice bob gently and clicking them rolls (blank faces before the
  first roll).
- Side column order: players, the log (taller, 320px), then a bank panel (cards left of each
  resource and the dev deck). The hand keeps its "Your hand" heading.
- Spectators see the status line and clock only.
- No stacking on small screens: the whole game screen (panels, not the map) is designed at
  1440×900 and scaled to the window (capped at 1.3×, floor 0.2×). Phones get the desktop
  layout, very small; the user prefers that to a rearranged layout. The map fits itself as
  before, and a scale change refits it like a window resize.
- Also on this branch: softer robber/pirate target flashing and the dev-card buy sound.

Not in scope: an own-seat card, chat changes, new
card art, moving the picking tray.

## Rules

None change. Piece limits stay in the engine modules (`pieceLimits`).

## Engine changes (test-first)

- `piecesLeft(state, player): Record<PieceTypeId, number>`, exported from the engine.
  For each piece type in `pieceLimits(modules)`: the limit minus the pieces that player owns.
  Tests: a new base game gives `{ road: 15, settlement: 5, city: 4 }`. After setup it gives
  13 roads and 3 settlements. Upgrading to a city gives back a settlement and uses a city.
  Seafaring adds `ship: 15`.

## Server/UI changes

- Protocol: `GameStateMessage.piecesLeft?: Record<string, number>` (optional, so older
  servers still work; the UI then hides the badges). The server fills it with `piecesLeft`
  for the seat, or `{}` for spectators. `LocalGame` does the same. `Snapshot.piecesLeft?`.
- `GameView`: a `.bottom-dock` holds `HandDock` (players only) and `ActionBar`; `BoardDice`
  sits in the board area. `TradePanel` is removed.
- `ActionBar`: rewritten as status line + optional card + square buttons (above).
- `HandDock`: unchanged fan; cards from the bank fly in from the bank panel (`data-bank`).
- `BankPanel` (new) and a clickable `BoardDice`.
- `ui/uiScale.ts` (pure `uiScale` + hook); `.layout-frame` holds the map and the scaled
  `.layout`. The phone-only game CSS (≤ 860px stacking, 48px cards) is removed; phone touch
  sizes still apply to the home and lobby screens.
- Icons: new original `devCard`, `moveShip`, `trade`, `endTurn`, `dice`, `harbor`.

## Test plan

- Engine: the `piecesLeft` tests above.
- Web: `ui/buildTiles.test.ts`: tiles carry the counts from the snapshot, are enabled only
  from `legal` (the engine already refuses a build with 0 left), add ship tiles in seafaring
  games, and show no badges without counts. `ui/uiScale.test.ts`: scale at common window
  sizes and the caps. `board/viewport.test.ts`: a scale change refits. `cards/cards.test.ts`:
  `bankTrade` accepts only your rate of one resource for one other card.
- Manual: the sandbox at desktop and phone widths; a seafaring game shows the ship tile.

## Open questions

- Resolved: the first pass (hand and a big action panel, half the width each) was replaced by
  the bottom-bar layout above. A one-card-per-type strip was tried and dropped: the user
  prefers splayed cards.
- Resolved: the dev card tile counts the cards left in the deck.
- Should the counts also appear for other players in the players panel? (Not planned.)

## Status

Shipped (merged into local `main`). Also included: softer robber/pirate target pulse, and
buying a dev card plays the resource-gain sound.
