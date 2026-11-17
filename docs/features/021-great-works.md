# 021 — Scenario 8: Great Works

## Goal

Scenario 8 of the seafaring rulebook (pages 18–19; our name "Great Works"): race to build a wonder. Each player may claim one of five wonders once they meet its requirement, then build it in four levels. Part of M10 (M10i), as a module `sf-great-works` on top of `seafaring`.

## Scope / non-scope

**Scope:** the rules below; 3p and 4p fixed maps and the variable setup; uses the seams from specs 018–020 (`checkWin` replacement, markers).

**Non-scope:** other scenarios; 5–6 players.

## Rules (rulebook pages 18–19)

- **No pirate.** The robber starts on a desert. Small islands give 1 island bonus VP each.
- **Setup:** starting settlements only on the large island, and not on a corner with a wall or bridge marker, nor on the corners marked X beside the bridge markers.
- **Wonders** (our names; the requirement and the cost of each level, from the wonder tiles):

  | Wonder | Requirement | Each level costs |
  | --- | --- | --- |
  | Sea Wall | a building on a wall-marker corner (the wasteland) | 1 wood, 3 brick, 1 wheat |
  | Grand Bridge | a building on a bridge-marker corner (the strait) | 3 wood, 1 wheat, 1 sheep |
  | Lighthouse Monument | a city on a harbor and a route of 5+ roads and/or ships | 3 wheat, 2 ore |
  | Amphitheatre | 2 cities | 1 wood, 1 brick, 3 sheep |
  | Citadel | a city and 6+ VP | 1 brick, 1 wheat, 3 ore |

- **Claiming:** when you meet a wonder's requirement you may claim it, free (one wonder per player; nobody else can then claim it).
- **Building:** each of the four levels costs that wonder's 5 resources; you may build as many levels in a turn as you can afford. Level 4 completes it.
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

- None. (Decided: the names and costs above; claiming is free and every level costs the wonder's 5 resources, per page 18.)

## Status

Draft
