# 018 — Scenario 5: Lost Settlers

## Goal

Scenario 5 of the seafaring rulebook (pages 12–13; our name "Lost Settlers"): a large island to start on, and small islands to the west reached by sea, where things lie waiting on the water: VP tokens, face-down development cards and harbors that a ship can pick up. Part of M10 (M10f), as a module `sf-lost-settlers` on top of `seafaring`.

## Scope / non-scope

**Scope**

- The scenario's rules (below), 3p and 4p fixed maps, and the variable setup the rulebook describes.
- The engine seams from decision record 0001 this needs: **markers** on map edges, **ports as state**, and **dev cards dealt onto the board** (a hidden zone).

**Non-scope**

- Other scenarios' rules. 5–6 players.

## Rules (rulebook pages 12–13)

- **Win:** 13 VP. No island bonus.
- **Setup:** starting settlements (with a road or ship) only on the large island. The robber starts on a desert; the pirate on its marked hex.
- **Numbered land only:** settlements may only be built on corners touching at least one hex with a number token, and the robber may only move to a hex with a number token.
- **Things on the water** (each on a marked sea edge at the start):
  - 8 **VP tokens**: building or moving one of your ships onto that edge takes the token; each is worth 1 VP.
  - 4 **face-down development cards**, dealt from the deck at the start: a ship reaching the edge takes the card, as if bought this turn (playable from your next turn; a VP card counts at once).
  - **Harbors** (5 specific 2:1 and one 3:1, shuffled onto their marked edges): a ship reaching the edge takes the harbor. You then place it face up on a coast edge next to one of your settlements or cities, at least one edge away from every other harbor. If there's no such edge you keep it until there is. A placed harbor works straight away.
- Everything else is the seafaring rules (spec 015).

## Engine changes

- **Seams (decision record 0001):**
  - `MapInput.markers`: `{ id, kind, at: { edge } | { vertex } | { hex }, data? }`, carried by the core, read by modules. Here: `vp-token`, `dev-card`, `harbor` (with the harbor's type).
  - **Ports as state:** `state.ports` (copied from the map at start); `tradeRatio` and the board read it. Base no-change test: identical play on base maps.
  - **Dev cards on the board:** at setup the module moves 4 random cards from `devdeck` into a hidden zone `board-devcards` (same odds as taking the top 4; nothing leaks). Taking one draws at random from that zone into `devnew-<p>`. Dev-card conservation counts the zone.
- **Module `sf-lost-settlers`** (`dependsOn: ["seafaring"]`):
  - `canPlace`: settlements need a numbered hex; the robber needs a numbered hex.
  - `onPlace` (ships built or moved): collect the marker on that edge. VP tokens go to a public zone `vp-<p>`; `vpSources` counts them.
  - Harbors taken go to `moduleState` (held per player); a decision `PLACE_HARBOR` is pushed when one can be placed; holders with nowhere to place keep it, and `PLACE_HARBOR` is offered in their main step once they can. Action `PLACE_HARBOR { edge }`.
- Tests: each marker kind via build and via move; the deck odds (4 cards leave the deck, conservation holds, nobody sees them); harbor placement spacing, holding a harbor, placing it later, using it at once; settlements and the robber limited to numbered hexes.

## Server/UI changes

- Maps: `markers` in `MapDefSchema` (edge / vertex / hex), validated (an edge marker sits on a sea edge). Fixed maps transcribed from the rulebook, checked against its component list (49 hexes; 8 VP tokens; ports 5×2:1, 1×3:1).
- Web: markers drawn on their edges (a VP medallion, a card back, a harbor sign); a harbor in hand shown in the hand dock with a "Place harbor" prompt and its legal edges as targets; VP tokens in the VP breakdown.
- Sim: invariants for markers (each taken at most once; VP tokens conserved).

## Test plan

Engine tests above; maps component counts; `pnpm sim --scenario lost-settlers` clean (3p and 4p, fixed and variable); manual play in the sandbox.

## Open questions

- Variable setup (page 13): the large island's hexes and tokens are random, the three hexes marked on its east side get no 5, 6, 8 or 9. Needs a constraint scoped to listed hexes (`no-tokens-on: [5,6,8,9]` with hex list). Fine to add?

## Status

Draft
