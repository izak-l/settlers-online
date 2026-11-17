# 229 — Lobby settings: players, points, discard limit and timer in the lobby

## Goal

The lobby is where the game is set up. The game type and map decide how many seats there can be; the host then tunes the game with a few clear settings (players, points to win, discard limit, turn timer) that start at the map's defaults. The house-rule checkboxes go. Every finished draft map becomes playable: plain island maps in the base game, island-and-sea maps under Free play in the seafaring types.

## Scope / non-scope

**Scope**

- **Home "New game"** asks only for the game type, then creates the lobby. Seat count, turn timer and spectators are lobby settings now.
- **Lobby settings** (a "Settings" block in the game column, under the map chooser; the host edits it, everyone else sees the values as text):
  - **Players:** 1 up to the most the map allows in this game type (`min(type max, map max)`). Counts below the number of people already seated are disabled. Raising it adds empty seats; lowering it moves seated players up into the first seats and drops empty seats.
  - **Points to win:** a stepper, 3–25.
  - **Discard limit:** a stepper, 5–20: "On a 7, anyone holding more than N cards discards half."
  - **Turn timer:** Off, 30, 60, 90, 120 seconds (the same choices as before, moved from Home).
  - **Allow spectators:** a checkbox (moved from Home).
  - A "Map defaults" link resets players, points and discard limit to the map's values.
- **Defaults:** players, points to win and discard limit start at the map's values (players = the most the map allows in this type; points = the map's `vpToWin`; discard limit = the map's `discardLimit`, 7 unless it says otherwise). Picking another map or game type resets all three to the new map's defaults; the turn timer and spectators setting are kept.
- **House rules** checkboxes are removed from the lobby. The map's own switches still apply (scenarios that turn things off keep doing so). The dev sandbox keeps its house-rule toggles for testing.
- **Maps:** the draft maps are promoted into the catalog (ids unchanged):
  - Base game: Crescent Bay, Great Hexagon, Hourglass, Lagoon Ring, Little Harbour (up to 3 players), Six-Point Star, The Boot.
  - Seafaring free play (both seafaring types): Scattered Isles, Inland Sea, Twin Isles, Six Shores (the world map).
  - The sandbox's Drafts tab stays for future drafts; it is hidden while the folder has none.
- **Phone width:** the "Selected" tag no longer wraps inside a narrow map card (seen at 390px).
- The summary card shows the lobby's players, points and discard limit, not just the map's.
- Any settings change asks everyone to ready up again (as map and type changes do).

**Non-scope**

- Bots for empty seats, 5–6 player games, the map editor (M8b).
- Changing settings after the game starts.
- Other house rules (e.g. a "no robber until turn N" option).

## Rules

- **Discard limit** is a game option: on a 7, a player holding more than the limit discards half (rounded down). The base game's limit is 7. A map may set its own (`discardLimit` in its JSON); the lobby may override it.
- **Points to win** overrides the map's `vpToWin` for that game.
- Both are fixed when the game starts and stored with the game's map, so replays need nothing else.

## Engine changes (test-first)

- `MapInput` / `MapDef` gain an optional `discardLimit` (positive integer). `GameOptions.discardLimit` = ruleset option, then map, then 7; `RulesetDef.options` accepts `discardLimit`.
- `robber.ts` reads the limit from the game's options (a helper falls back to 7 for snapshots saved before the option existed) instead of the `HAND_LIMIT` constant.
- Tests: with a limit of 9 an 8-card hand doesn't discard; with 5 a 6-card hand discards 3; a map without the field behaves exactly as before (base-module regression test); `vpToWin` from the map is still the default.

## Server/UI changes

- `packages/maps`: the 11 draft JSON files move to `maps/` and into `MAP_CATALOG`; `mapsForType` already sorts them by module and player count. `discardLimit` in the schema. A helper `seatCap(type, def)` = `min(type.maxPlayers, def.players.max)`.
- `packages/protocol`:
  - `lobby:create`: `{ gameType }`; `maxSeats`, `allowSpectators` and `turnSeconds` become optional (defaults: the map's cap, spectators allowed, timer off).
  - New `lobby:settings`: `{ lobbyId, maxSeats, vpToWin, discardLimit, turnSeconds, allowSpectators }`, sent whole (host only, while open; clears ready flags).
  - `lobby:features` is removed; `LobbyState.houseRules` goes; `LobbyState` gains `vpToWin` and `discardLimit`.
- `apps/server`: migration 010 adds `vp_to_win` and `discard_limit` to `lobbies` (null = the map's value, so older lobbies keep working). `LobbyService.setSettings` checks ranges, the seat cap and the seated count (`BAD_REQUEST` with a message otherwise) and resizes seats. `setMap` / `setType` reset players, points and discard limit to the new map's defaults. At start, `vpToWin` and `discardLimit` are folded into the stored map beside the features. Existing lobbies' saved house rules keep applying (no new ones can be set).
- `apps/web`: Home form (type, create); `LobbySettings` component in the lobby; `HouseRules` removed from the lobby; summary card reads lobby values; CSS fix for the selected tag.

## Test plan

- Engine: the discard-limit tests above; replaying a game started with a custom limit and VP reproduces it.
- Maps: every promoted map is in the catalog, belongs to the right types (base drafts only in `base`; seafaring drafts in both seafaring types; Little Harbour capped at 3); catalog test still finds every JSON file.
- Fuzz: `pnpm sim --games 500` on each promoted map at its largest seat count and at 2 seats; any failure becomes a regression test.
- Protocol: `lobby:settings` parses; out-of-range values and unknown keys fail; create without seats parses.
- Server (online suite): a new lobby has the map's defaults; settings change seats up and down (seated players move up); lowering below the seated count is refused; out-of-range VP/limit refused; non-host refused; map and type changes reset to defaults; the started game uses the lobby's VP and discard limit.
- Web: settings render values for guests and controls for the host; checked in the browser at desktop and 390px wide (no overflow, the selected tag on one line).

## Open questions

- None. (Decided: spectators move into the lobby settings; a map or type change resets players, points and discard limit to the new map's defaults; points 3–25, discard limit 5–20.)

## Status

Shipped (on `lobby-ui`). As built:

- Settings sit right under the summary card (above the game type and map list), so the host doesn't scroll past every map to reach them. Guests see them as a list.
- `lobby:create` still honours a seat count when one is sent (older clients and the server tests); Home sends only the type.
- A type change now also resets seats to the new default map's cap, so a lobby can grow again (spec 023 only ever shrank it).
- Shrinking seats keeps seated players in place when they all fit; otherwise they move up in order.
- `seatCap` / `mapDefaults` live in `packages/maps` (`gameTypes.ts`); the ranges are `LOBBY_LIMITS` in `packages/protocol`. The web logic is in `ui/lobbySettingsModel.ts` (`lobbySettings.ts` would clash with `LobbySettings.tsx` on case-insensitive disks).
- The engine's discard limit is `options.discardLimit` (ruleset, then map, then 7); `discardLimit(state)` reads 7 for older snapshots. The golden base replays are unchanged apart from the new field.
- All 11 drafts were promoted. Fuzzing (500 games per map at full seats and at 2) found no failures. On the island maps the simple bots hit the 400-turn cap in 30–80% of games because they are slow sailors.
