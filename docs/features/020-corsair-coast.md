# 020 — Scenario 7: Corsair Coast

## Goal

Scenario 7 of the seafaring rulebook (pages 16–17; our name "Corsair Coast"): a pirate fleet circles the sea and raids your coast, and each player must sail a single line of ships to their own pirate fortress in the west and take it back. Part of M10 (M10h), as a module `sf-corsairs` on top of `seafaring`. The most rules-heavy scenario.

## Scope / non-scope

**Scope:** the rules below; 3p and 4p fixed maps (the rulebook gives no variable setup); the engine seams: **`afterRoll` hook**, **handler precedence**, **piece `attrs`**, **pieces placed by the map**, **deck changes**, plus `onTurnEnd` and `checkWin` replacement from spec 019.

**Non-scope:** other scenarios; 5–6 players.

## Rules (rulebook pages 16–17)

- **Switched off:** the robber, Longest Trade Route and Largest Army (spec 014 switches, set by the map).
- **Setup:** each player starts with a settlement and a ship already on the east (main) island's coast, placed by the map, then places two starting settlements with roads or ships on the main island as usual (three settlements each). Six land hexes have no number token. Each player has a pirate fortress (a settlement on 3 lair tokens) on the western pirate islands and a beachhead marker; with 3 players the white pieces aren't used. Fortresses don't produce.
- **Dev deck:** with 3 players the VP cards are removed; with 4 players VP cards count as Knights.
- **The pirate fleet** moves along a fixed path around the centre: after the dice are rolled, before production or a 7, it moves as many hexes as the lower die (either one on a double).
- **Pirate attacks:** if it stops next to one of your buildings, it attacks you (before production or the 7). Its strength is that die; yours is the number of your warships. Pirate stronger: discard 1 random card plus 1 per city. You stronger: take 1 resource of your choice. Tie: nothing.
- **A 7:** players over 7 cards discard half as usual; then the roller steals 1 random card from any other player.
- **Ships:** one continuous line of ships to the west, no branching, from one of your coastal buildings on the main island, through your beachhead, ending at your own fortress, along a shortest path. Other ship routes around the main island are allowed.
- **Beachhead:** once your line reaches your beachhead marker you may build a settlement there (normal cost).
- **Warships:** playing a Knight (or, with 4 players, a VP card) turns the ordinary ship in your line closest to its starting settlement into a warship; the card is removed from the game. Knights do nothing else.
- **Attacking your fortress:** at the end of your turn's main step, if your line reaches your fortress, you attack: roll a die for the pirates' strength. More warships in your line than that: remove one lair token. Fewer: remove the 2 ships closest to the fortress. Equal: remove 1. Your turn then ends. With all 3 lair tokens gone the fortress becomes your settlement (it produces and can become a city). When every fortress is taken, the pirate fleet leaves the game.
- **Win:** you have captured your fortress and have 10 or more VP during your turn.

## Engine changes

- **Seams (decision record 0001):** `afterRoll` (fleet moves and attacks before production / 7); handler precedence (a later module may replace `PLAY_KNIGHT` and the 7's robber step); `Piece.attrs` (`warship: true`); pieces placed by the map (`map.startingPieces` per seat); deck changes in `setup`; `onTurnEnd` (fortress attack); `checkWin` replacement (fortress + 10 VP). Each with a base no-change test.
- **Module `sf-corsairs`:** fleet position and path from map markers (`pirate-path` hexes in order); attack and choice steps (`PIRATE_LOOT` pick for a won defence); ship line rules in `canPlace` (single line, no branch, shortest path to the beachhead then fortress, computed with a BFS over sea edges); fortress lair tokens in `moduleState`; dice for the fortress attack from the game RNG.
- Tests: fleet movement and attacks (all three outcomes, the city-based discard); the 7 steal from anyone; line rules (branching refused, a longer path refused); warship conversion and its order; fortress attack outcomes and capture; the win condition; 3p vs 4p deck changes.

## Server/UI changes

- Maps: `pirate-path`, `fortress`, `beachhead` markers and `startingPieces`; fixed maps transcribed and checked (49 hexes; lair tokens 12; ports 5×2:1, 3×3:1).
- Web: the pirate path and fleet, fortresses with remaining lair tokens, beachheads, warships drawn on their side; attack results in the log; the loot pick reuses the gold tray.
- Sim: invariants (lair tokens only go down; warships only in a line; one line per player).

## Test plan

Engine tests above; maps component counts; `pnpm sim --scenario corsair-coast` (3p and 4p); manual play.

## Open questions

- None. (Decided: every ship added must keep the line on some shortest sea route to your beachhead, then your fortress; the fortress attack happens automatically at the end of every turn's main step while your line reaches it, until it's captured.)

## Status

Draft
