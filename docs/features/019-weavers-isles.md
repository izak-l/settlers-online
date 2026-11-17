# 019 — Scenario 6: Weavers' Isles

## Goal

Scenario 6 of the seafaring rulebook (pages 14–15; our name "Weavers' Isles"): two large islands to settle, and small islands with villages that weave cloth. Connect your network to a village to trade with it; two cloth are worth 1 VP. Part of M10 (M10g), as a module `sf-weavers` on top of `seafaring`.

## Scope / non-scope

**Scope:** the rules below; 3p and 4p fixed maps (variable setup as the rulebook describes); the engine seams it needs: **setup sequence**, **end-of-turn hook**, **`checkWin` replacement**, a **steal-choice** extension.

**Non-scope:** other scenarios; 5–6 players.

## Rules (rulebook pages 14–15)

- **Setup: three starting settlements.** The first two are placed as usual (snake order, with a road or ship each) but give no resources. Then each player, from the first player in turn order, places a third settlement with a road or ship, and takes starting resources for that one only. Settlements may go on either large island.
- **No Longest Trade Route** (the feature switch from spec 014 is off). No island bonus.
- **No settlements on the small islands.**
- **Villages:** a village is a number token on a corner: on each small-island hex, one on its north corner and one on its south corner, each starting with 5 cloth next to it; 10 more cloth are a general supply.
  - When you make a route (your roads and ships, joined as for the longest route) from one of your buildings to a village, you take 1 cloth from that village at once, and you are now trading with it.
  - When a village's number is rolled, every player trading with it takes 1 cloth from it; if it runs short, the rest come from the general supply. A village with no cloth left produces nothing more (and the general supply isn't used for it).
  - Every 2 cloth you hold are worth 1 VP.
- **Ships:** a route that connects one of your buildings to a village is closed: none of its ships may move (you may still extend or branch from it).
- **Robber:** may not move to the small islands. **Pirate:** you may only move it once you have a route to a village; when you do, you may steal a resource card or a cloth from a player with a ship next to it.
- **Win:** 14 VP during your turn; or, at the end of any turn when 5 or more villages have no cloth left, the player with the most VP wins (a tie goes to the most cloth among them).

## Engine changes

- **Seams (decision record 0001):**
  - **Setup sequence:** a module may replace the setup decisions base builds (a `setupSequence` hook returning the list), and may say which round gives starting resources. Base no-change test.
  - **`onTurnEnd` hook:** runs when a turn ends.
  - **`checkWin` replacement:** the last module that defines `checkWin` decides (like `rollDice`); it may name a winner who isn't the active player at a turn's end.
  - **Steal choices:** the `STEAL` step may offer `{ from, what }` where `what` is a resource card or a module item (cloth).
- **Module `sf-weavers`:** villages from map markers (`village`, at a vertex, with a token number); zones `cloth-<village>` (public), `cloth-supply`, `cloth-<p>` (public); `produce` pays cloth; `onPlace` checks for new village routes (graph search over the player's roads, ships and buildings); `canPlace` (no settlements on small islands; robber not there; pirate only once trading); `vpSources` (cloth pairs); `onTurnEnd` + `checkWin` for the five-empty-villages ending; ship moves refuse ships on a closed village route; `features.longestRoad` off via the map.
- Tests: three-settlement setup and its resources; route detection (roads + ships through own buildings, opponents block); production with the supply top-up and empty villages; cloth VP; closed routes; robber and pirate limits; steal choice; both endings and the tie-break.

## Server/UI changes

- Maps: `village` markers; fixed maps transcribed and checked (42 hexes, 50 cloth, ports 5×2:1, 4×3:1).
- Web: villages drawn on their corners with cloth counts; your cloth in the hand dock; the steal picker offers cloth; the end-of-game reason shown.
- Sim: invariants (cloth conserved across villages, supply and players).

## Test plan

Engine tests above; maps component counts; `pnpm sim --scenario weavers-isles`; manual play.

## Open questions

- None. (Decided: villages are on the north and south corners of each small-island hex; the robber starts on the 12 hex the map names.)

## Status

Draft
