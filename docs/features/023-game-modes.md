# 023 — Game modes: pick the mode, then the map

## Goal

The lobby host picks a **game mode** first, then a **map** within it. A mode is a rule set and player count: e.g. Base, Seafaring (3 players), Seafaring (4 players), later Seafaring (5–6 players) and Cities & Knights. Each map belongs to one or more modes, so only maps that fit the mode are offered, and nothing has to support every rule set and player count.

This replaces the current rule where a seafaring scenario's 3p or 4p map is chosen silently from the seat count.

## Scope / non-scope

**Scope**

- A mode catalog: each mode has an id, our own display name, its modules, its player range, and the maps it offers.
- Maps (catalog maps and scenario maps) say which modes they belong to.
- Lobby flow: choose mode → choose map (→ fixed / variable for scenarios that have both). House rules (spec 014) stay where they are.
- The host chooses the mode on the home screen, when creating the lobby; the lobby's seats are then 1 up to the mode's maximum. A mode's (and every map's) player count is an upper bound: a game may start with fewer players (later, bots can fill empty seats).
- The dev sandbox uses the same two-step picker.

**Non-scope**

- 5–6 player modes: they need 5–6 player games (the rulebook's 5–6 extension adds a special building phase and more pieces), which we don't support yet. The mode list is ready for them.
- Cities & Knights maps (M11).

## Modes at first

| Mode | Modules | Players | Maps |
| --- | --- | --- | --- |
| Base | base | 1–4 | Standard Island, Grand Diamond |
| Seafaring (3 players) | base, seafaring | up to 3 | each scenario's 3p map |
| Seafaring (4 players) | base, seafaring | up to 4 | each scenario's 4p map, Uncharted Seas |

## Server/UI changes

- `packages/maps`: `MODE_CATALOG`; `mapsForMode(mode)`; maps tagged with modes (scenario maps by their size; catalog maps in the JSON).
- `packages/protocol`: `lobby:map` gains the mode (`{ mode, map, setup? }`); `LobbyState` shows the mode.
- `apps/server`: checks the map belongs to the mode and the seat count fits; stores the mode with the lobby.
- `apps/web`: the home "new game" form asks for the mode first, then the seat count (up to the mode's maximum); the lobby's map section lists only that mode's maps (→ Fixed / Variable).
- Maps' `players.min` becomes 1 everywhere (the maximum is the upper bound).

## Test plan

Protocol payloads; server: a map outside its mode is refused, a seat count outside the mode is refused; web: the picker only lists a mode's maps; sandbox the same.

## Open questions

- None. (Decided: the mode is chosen on the home screen before the lobby exists; player counts are upper bounds, fewer may start.)

## Status

Draft
