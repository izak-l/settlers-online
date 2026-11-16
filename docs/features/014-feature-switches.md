# 014 — Base-game feature switches

## Goal

Parts of the base game can be turned off, by a map or by the lobby host as a house rule. Later modules (seafaring scenarios 6 and 7 turn off the robber and the awards; knights-and-cities turns off dev cards and Largest Army; explorers turns off several features) need this seam, and friends get house rules such as "no dev cards" straight away. This is the first part of M10 (M10a).

## Scope / non-scope

**Scope**

- Five switches, all on by default: `devCards`, `robber`, `longestRoad`, `largestArmy`, `ports`.
- A map may set any of them (`features` in the map JSON). The lobby host may change them before the game starts. The lobby wins over the map, the map wins over the defaults.
- The game shows which switches are off (lobby summary, and the panels and board hide what doesn't exist).

**Non-scope**

- Variant rules beyond turning a feature off (friendly robber, different VP for awards, a different hand limit).
- Modules switching features off (that comes with the module that needs it; the seam is the same `features` option).

## Rules

- **`devCards` off:** no dev deck, no `BUY_DEV_CARD`, no dev card plays. Largest Army can't be earned (no knights), whatever its own switch says.
- **`robber` off:** no robber on the board. A 7 still makes everyone over 7 cards discard half, then play goes on to the main step: no robber move, no steal. Knights still count towards Largest Army but don't move anything.
- **`longestRoad` / `largestArmy` off:** the award isn't computed, held or shown, and gives no VP.
- **`ports` off:** every bank trade is 4:1. The map's ports stay in the state (so the switch can't change the board) but aren't drawn.
- Switches are fixed when the game starts and stored in the game state (`options.features`), so replays and snapshots use them.

## Engine changes

- `GameOptions.features: Record<FeatureId, boolean>`; `FeatureId` and `BASE_FEATURES` (all `true`) exported from the engine. `createGame` fills `options.features` from the defaults, then the map, then `ruleset.options.features`.
- `MapInput` gets an optional `features`.
- Base module: a `featureOn(state, id)` helper in `modules/base/helpers.ts`, used by:
  - `setup.ts`: no robber piece (`robber`), no dev deck zone (`devCards`);
  - `helpers.ts`: `rollDecision` / `mainDecision` leave out `BUY_DEV_CARD` and the play actions (`devCards`); the decision builders take the state;
  - `robber.ts`: `startSevenFlow` pushes `MOVE_ROBBER` only with `robber` on;
  - `devcards.ts`: a knight with `robber` off only counts towards the army;
  - `awards.ts`: `updateAwards` and `awardVP` skip a switched-off award;
  - `trade.ts`: `tradeRatio` returns 4 with `ports` off.
- These are base-module flags about base features, not checks for an expansion, so architecture rule 4 holds.
- Tests (test-first, `features.test.ts`): each switch off on its own; `devCards` off removes Largest Army too; a 7 with the robber off goes from discards straight to the main step. **No-change test:** a scripted base game with every switch explicitly on replays to the same final state as with no `features` at all.

## Server/UI changes

- `packages/maps`: optional `features` on `MapDefSchema` and `ResolvedMap`; the generator copies it through.
- `packages/protocol`: `lobby:features` (`{ lobbyId, features: Partial<Record<FeatureId, boolean>> }`, host only); `LobbyState` carries the effective switches.
- `apps/server`: migration `008_lobby_features.sql` adds `lobbies.features jsonb` (null = map defaults). Changing switches clears every ready flag, like changing the map. Changing the map keeps the lobby's own overrides. On start the server passes them as `RulesetDef.options.features`.
- `apps/web`: a "House rules" group of toggles on the lobby screen (host only; others see a summary such as "No dev cards"). In game, the dev card panel, award badges and port signs are hidden when their switch is off. The dev sandbox gets the same toggles.
- `tools/sim`: `--features devCards=off,robber=off` runs the fuzzer with switches off.

## Test plan

- Engine: the `features.test.ts` cases above; the existing suites unchanged.
- Maps: a map with `features` parses and generates.
- Protocol: `lobby:features` payloads parse; unknown feature names are rejected.
- Server (online suite, memory and Postgres): a host turns off dev cards and starts; the game's `options.features` match; a non-host change is rejected; a change clears ready flags; an old lobby row with no `features` starts with the map's defaults.
- `pnpm sim --games 500 --seed 1` with each switch off runs clean.
- Manual: a game with dev cards and the robber off in the sandbox and online.

## Open questions

- None yet. (Decided with the user: maps and the lobby host can both set the switches.)

## Status

Draft
