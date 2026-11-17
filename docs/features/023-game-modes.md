# 023 — Game modes: pick the game type, then the map

## Goal

The lobby makes it obvious what game is being set up. The host picks a **game type** (a rule set and player count: Base, Seafaring for 3 players, Seafaring for 4 players), then a **map** within it. For Seafaring the map is either a **scenario** (the rulebook's scenarios, each with its own rules, played fixed or variable) or **free play** (the seafaring rules on a plain island map). Only maps that fit the game type are offered, and nothing has to support every rule set and player count.

This replaces the current single list of every map and scenario, the global Fixed / Variable switch above it, and the rule where a scenario's 3p or 4p map is chosen silently from the seat count. It also fixes the lobby's layout, which overflows its panel.

## Scope / non-scope

**Scope**

- A game-type catalog: each type has an id, our own display name, its modules, its maximum players and the maps it offers.
- Maps (catalog maps and scenario maps) say which game types they belong to.
- Home screen "New game": choose the game type, then the seat count (1 up to the type's maximum).
- Lobby: the host may change the game type at any time before the start, as long as everyone already seated fits its player limit; seats beyond the new limit must be empty and are removed. Changing type picks that type's default map (the base map, or the type's first scenario) and asks everyone to ready up again.
- Lobby layout: two columns on wide screens (the game on the left; invite link, friends and seats on the right), one column on narrow ones. No overflow at any width.
- The game section: a summary card everyone sees (game type, map or scenario, setup, VP target, a one-line note of special rules); below it, for the host, the picker. Base lists its maps. Seafaring has two tabs: **Scenarios** and **Free play**. The selected card is clearly marked (filled border and a "Selected" tick); Fixed / Variable is a choice inside the selected scenario card (only shown when the scenario has both).
- A player count is an upper bound: a game may start with fewer players (later, bots can fill empty seats).
- The dev sandbox uses the same game-type and map picker.

**Non-scope**

- 5–6 player modes (they need 5–6 player games: a special building phase and more pieces). The catalog shape allows them later; they are not shown.
- Cities & Knights (M11).

## Game types at first

| Id | Display name | Modules | Players | Maps |
| --- | --- | --- | --- | --- |
| `base` | Base game | base | up to 4 | Standard Island, Grand Diamond |
| `seafaring-3` | Seafaring · 3 players | base, seafaring | up to 3 | each scenario's 3p maps; free-play maps |
| `seafaring-4` | Seafaring · 4 players | base, seafaring | up to 4 | each scenario's 4p maps; free-play maps |

Free-play maps are seafaring island maps with no scenario rules (players pick their home islands in setup; no island bonus). The first ones are promoted from `packages/maps/maps/drafts/` once they pass the catalog checks and fuzzing; Uncharted Seas (spec 022) joins them when it is built.

## Server/UI changes

- `packages/maps`: `GAME_TYPES` (id, name, modules, max players); `mapsForType(type)` returning base maps, scenarios (with the type's player size) and free-play maps; catalog maps carry `types` in their JSON; scenario maps belong to `seafaring-3` / `seafaring-4` by size.
- `packages/protocol`: create-lobby takes the game type; `lobby:map` becomes `{ type, map }` where `map` is `{ builtin: id }` or `{ scenario: id, setup }`; `LobbyState` includes the type.
- `apps/server`: the lobby stores the game type (migration); the server refuses a map outside the type and a type change that doesn't fit the seated players; the stored map id still names the scenario, setup and size, so games and history need no change.
- `apps/web`: home form (type, then seats); lobby layout and game section as above; the sandbox picker.
- Maps' `players.min` is 1 everywhere (the maximum is the upper bound).

## Test plan

- Maps: every map belongs to at least one type; `mapsForType` lists only fitting maps; scenario maps by size.
- Protocol: the new payloads parse, malformed ones fail.
- Server (online suite): create a lobby of each type; a map outside the type is refused; changing type with too many seated players is refused; changing type with an empty extra seat works and drops the seat.
- Web: the picker lists only the type's maps; the selected card is marked; Fixed / Variable only on the selected scenario; the lobby doesn't overflow at phone and desktop widths (checked in the browser).

## Open questions

- None. (Decided: the type is chosen on the home screen and may be changed in the lobby while the seated players fit; no 5–6 player option is shown yet; player counts are upper bounds.)

## Status

Shipped (on `lobby-modes`). As built:

- Maps aren't tagged with types in their JSON: membership follows from what a map is (base-only, scenario at a size, or seafaring free play), in `mapsForType` / `scenariosForType` / `mapForType`.
- Changing type is its own event, `lobby:type`; `lobby:map` keeps its shape and is checked against the lobby's type.
- Seafaring lobbies start on their first scenario (New Horizons); the free-play maps at first are Home Waters and Rising Chain, promoted from the drafts after fuzzing clean.
- The lobby's seat count never grows when the type allows more; it only shrinks to the type's limit.
- Fixed / Variable is labelled "Rulebook layout" / "Random layout" in the UI.
