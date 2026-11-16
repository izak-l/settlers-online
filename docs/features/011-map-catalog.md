# 011 — Map catalog: custom maps chosen in the lobby

## Goal

We (the developers) can add a map by writing a JSON file in the repo, and lobby hosts can pick any catalog map when they create a game. This replaces the in-app map editor for now, so the expansions can start sooner; seafaring's scenario maps will be added the same way.

## Scope / non-scope

**Scope**

- **Catalog:** every `packages/maps/maps/*.json` file is a map, listed in one catalog (`MAP_CATALOG` in `@settlers/maps`) with its own display name and a one-line description. The random base board is the first entry and the default.
- **Checked in CI:** a test validates every catalog map and generates it over 1,000 seeds (so a broken pool, a port off the coast or a bad constraint fails the build, not a game).
- **Lobby choice:** the host picks a map when creating a lobby. Only maps whose player range includes the seat count are offered. The lobby screen shows the chosen map to everyone.
- **Server checks:** `lobby:create` rejects an unknown map id or a seat count outside the map's range. At start, the game is created from that map with that map's `modules` (no longer hard-coded to `base`); every module the map names must exist in the engine.
- **Preview while authoring:** the dev sandbox gets a map picker, so a new JSON file can be seen and played locally before it's committed.
- **History:** game history shows each game's map name.
- **Two example maps** prove the path (see Open questions).
- **Fix `validateMapDef`:** it counts every `pool:tokens` hex but forgets that deserts drawn from the land pool get no token, so it rejects the base map itself (found while planning; it had no test). Tokens needed = `pool:tokens` hexes − deserts in `pools.land` − literal desert hexes.
- **Drafts:** `packages/maps/maps/drafts/` holds work-in-progress maps that aren't in the catalog yet (not validated in CI, not offered in lobbies). The dev sandbox can still preview them.

**Non-scope**

- The in-app map editor (moved to a later milestone), maps stored in the database, uploading or sharing maps, per-lobby map options beyond the choice itself.
- Validation changes that only seafaring needs (islands, ships, gold, fog): they land with M9 as part of the seafaring module.

## Rules

- A map's `players`, `vpToWin`, `robberStart`, `constraints` and `modules` apply as written. The engine already takes the win target from the map.
- Map ids are stable: once a map is in the catalog its id never changes, because lobbies store it. Games store the whole resolved map, so editing or removing a map file never changes a game already started.
- Display names and descriptions are our own words (IP rules).

## Engine changes

None. (`createGame` already takes any resolved map and ruleset.)

## Server/UI changes

- `packages/maps`: `src/catalog.ts` (the catalog: id, name, description, `MapDef`), `src/__tests__/catalog.test.ts`, new map JSON files. Optional `name` / `description` fields on `MapDefSchema`.
- `packages/protocol`: `lobby:create` takes `mapId` (default: the base map); `LobbyState` and history entries carry `mapId` and the map name; a new error code `UNKNOWN_MAP` (and `BAD_REQUEST` for a seat count the map doesn't allow), each with a UI message.
- `apps/server`: migration `007_lobby_map.sql` adds `lobbies.map_id text not null default 'base-4p'`; `lobbies.ts` checks the map on create and uses it (and its modules) on start; history reads the map name from the stored game map.
- `apps/web`: a map picker on Home's "new game" (filtered by seat count), the map name in the lobby and in "Your games", and a map picker in the dev sandbox.

## Test plan

- `validator.test.ts`: `validateMapDef` accepts the base map and counts tokens correctly with deserts in the pool.
- `catalog.test.ts`: ids are unique and match file names; every map passes the schema and validator; each generates cleanly over 1,000 seeds; player ranges are sane (1 ≤ min ≤ max ≤ 4); every listed module exists in the engine.
- Protocol: `mapId` accepted / defaulted; unknown ids are left to the server.
- Server (online suite, memory and Postgres): create a lobby on a non-default map, start it, and the game's map and modules match; an unknown map and a seat count outside the range are rejected.
- `pnpm sim` gains `--map <id>`; run the fuzzer clean on each new map.
- Manual: pick each map in the sandbox and in an online lobby; check the board fits and zooms.

## Draft maps (in `packages/maps/maps/drafts/`, reviewed)

Written by a separate session from ASCII shapes in `drafts/build.ts`; `drafts/check.ts` validates them and `drafts/preview.ts` renders `preview.html` (gitignored). All four pass the schema, pool accounting and 200 generated seeds each.

| File | Name | Land hexes | VP | Modules | Playable now |
| --- | --- | --- | --- | --- | --- |
| `grand-diamond.json` | Grand Diamond | 49 | 12 | base | yes: the first catalog map |
| `twin-isles.json` | Twin Isles | 66 | 13 | base, seafaring | after seafaring (islands) |
| `world.json` | Six Shores | 82 | 14 | base, seafaring | after seafaring |
| `archipelagos.json` | Scattered Isles | 61 | 13 | base, seafaring | after seafaring |

Review notes for when they move into the catalog:

- **Fewer 6s and 8s on big maps.** To keep the random no-adjacent-6/8 shuffle from failing, `build.ts` uses only 1–2 copies of the base token set and tops up with 4/5/9/10, so about 17% of tokens are red instead of 22%. Better: teach the generator to place red tokens first on non-adjacent hexes, then restore full copies.
- **Auto ports on multi-island maps** are spread by angle around the board centre, so two can land close together on one island (two "2:1 wheat" on Twin Isles' smaller island; overlapping labels in Six Shores around the southern peninsula). Fix the island maps' ports by hand, or spread ports per island, when seafaring lands.
- The island maps fail "land is connected", as expected; seafaring (M10) relaxes that check for maps that use it.
- Display names are our own; real place names appear only in descriptions.

## Open questions

- None. (Decided: the drafted maps above; Grand Diamond goes in the catalog first, the island maps with seafaring.)

## Status

Draft
