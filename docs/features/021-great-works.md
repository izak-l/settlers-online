# 021 — Scenario 8: Great Works

## Goal

Scenario 8 of the seafaring rulebook (pages 18–19; our name "Great Works"): race to build a wonder. Each player may claim one of five wonders once they meet its requirement, then build it in four levels. Part of M10 (M10i), as a module `sf-great-works` on top of `seafaring`.

## Scope / non-scope

**Scope:** the rules below; 3p and 4p fixed maps and the variable setup; uses the seams from specs 018–020 (`checkWin` replacement, markers).

**Non-scope:** other scenarios; 5–6 players.

## Rules (rulebook pages 18–19)

- **No pirate.** The robber starts on a desert. Small islands give 1 island bonus VP each.
- **Setup:** starting settlements only on the large island, and not on a corner with a wall or bridge marker, nor on the corners marked X beside the bridge markers.
- **Wonders** (five; our own names for each, the rulebook's requirements):
  - a wall wonder: needs a building on one of the wall-marker corners;
  - a bridge wonder: needs a building on one of the bridge-marker corners;
  - a monument: needs a city on a harbor and a route of 5 or more roads and/or ships;
  - a theatre: needs 2 cities;
  - a castle: needs a city and 6 or more VP.
- **Claiming:** when you meet a wonder's requirement you may claim it (one wonder per player; nobody else can then claim it). Claiming costs the price on its tile and puts your marker on level 1.
- **Building:** each of the four levels costs the same 5 resources (per wonder); you may build as many levels in a turn as you can afford. Level 4 completes it.
- **Win:** during your turn, finish your wonder; or have 10 or more VP and a higher completed wonder level than every other player.

## Engine changes

- **Module `sf-great-works`:** wonder definitions (requirement, claim cost, level cost) as data; `moduleState` holds who claimed what and levels; actions `CLAIM_WONDER { wonder }` and `BUILD_WONDER_LEVEL` in the main step (`extraActions`); `canPlace` for the setup restrictions (vertex markers); `checkWin` replacement for both win conditions; the island bonus comes from seafaring (scenario `islandBonus: 1`).
- Tests: each requirement; one claim per player and per wonder; costs; several levels in a turn; both win conditions (including the "higher level than everyone" tie case: no winner on a tie).

## Server/UI changes

- Maps: `wall`, `bridge`, `no-setup` vertex markers; fixed maps transcribed and checked (49 hexes; ports 5×2:1, 4×3:1).
- Web: a wonders panel (requirements, who claimed which, levels, costs), with Claim and Build level buttons from `legal`; markers on the board.
- Sim: invariant (levels only go up, one wonder per player).

## Test plan

Engine tests above; maps component counts; `pnpm sim --scenario great-works`; manual play.

## Open questions

- Each wonder's claim and level costs are printed only as icons on the wonder tiles; to be read from the rulebook's wonder art (pages 18–19) while transcribing, and checked with you.
- Our wonder names: Sea Wall, Grand Bridge, Lighthouse Monument, Amphitheatre, Citadel. OK, or other names?

## Status

Draft
