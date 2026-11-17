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
- A column to the right: the dice over a big End turn button, which becomes Roll dice on
  your roll step.
- The bar has a fixed height, the same for the hand and the status + buttons stack. The map
  re-fits whenever the space above the bar changes, so anything that comes and goes (the
  prompt card, menus, picking trays, the open dev card, flying cards) floats over the map
  and gaining or spending cards never moves the view.
- Build buttons carry a "left" badge: the limit minus pieces on the board (road 15,
  settlement 5, city 4, ship 15 in seafaring games); the dev card button shows the cards left
  in the deck (25 at the start). Hover or keyboard focus shows the name and cost.
- The Trade button opens a small menu (bank, with your port rates, or an offer to players);
  the side column's trade panel is gone.
- On your roll step the dice bob gently and clicking them rolls (blank faces before the
  first roll).
- Side column order: the log (taller, 320px), a bank panel (cards left of each resource and
  the dev deck), then players.
- Spectators see the status line and clock only.
- Narrow screens (≤ 860px): the status and buttons stack above the hand strip; the side
  column gets less height so the map stays usable.
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
- Icons: new original `devCard`, `moveShip`, `trade`, `endTurn`, `dice`, `harbor`.

## Test plan

- Engine: the `piecesLeft` tests above.
- Web: `ui/buildTiles.test.ts`: tiles carry the counts from the snapshot, are enabled only
  from `legal` (the engine already refuses a build with 0 left), add ship tiles in seafaring
  games, and show no badges without counts.
- Manual: the sandbox at desktop and phone widths; a seafaring game shows the ship tile.

## Open questions

- Resolved: the first pass (hand and a big action panel, half the width each) was replaced by
  the bottom-bar layout above. A one-card-per-type strip was tried and dropped: the user
  prefers splayed cards.
- Resolved: the dev card tile counts the cards left in the deck.
- Should the counts also appear for other players in the players panel? (Not planned.)

## Status

In progress on the `ui-updates` branch. Also on it: softer robber/pirate target pulse, and buying a dev card
plays the resource-gain sound.
