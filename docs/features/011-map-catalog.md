# 011 — Map catalog: custom maps chosen in the lobby

## Goal

We (the developers) can add a map by writing a JSON file in the repo, and lobby hosts can pick any built-in map for their game. This is part one of M8 (M8a). Part two (M8b, spec 013) adds an in-app map editor whose maps are saved per user and picked in the same lobby picker; this spec lays the ground for it (lobbies keep their own copy of the chosen map, and the protocol already names where a map comes from).

## Scope / non-scope

**Scope**

- **Catalog:** every `packages/maps/maps/*.json` file is a built-in map, listed in one catalog (`MAP_CATALOG` in `@settlers/maps`) with its own display name and a one-line description. The random base board is the first entry and the default. `catalog.ts` imports each file statically (the server is bundled and the web app is built by Vite, so nothing scans folders at runtime); a test fails if a file in the folder isn't in the catalog.
- **Checked in CI:** a test validates every catalog map and generates it over 1,000 seeds (so a broken pool, a port off the coast or a bad constraint fails the build, not a game).
- **Lobby choice:** new lobbies start on the base map. On the lobby screen the host picks a map and can change it until the game starts; changing it clears every ready flag. Only maps whose player range includes the lobby's seat count are offered. Everyone sees the chosen map's name, description, player range, VP target and a preview.
- **Lobbies keep a copy:** when a map is chosen, the server validates it and stores its definition on the lobby. The game starts from that copy, so later edits or removals never change an open lobby. (M8b's user maps take the same path.)
- **Server checks:** `lobby:map` rejects an unknown map or a seat count outside the map's range. At start, the game is created from the lobby's map with that map's `modules` (no longer hard-coded to `base`); every module the map names must exist in the engine.
- **Size limits** in `MapDefSchema` (needed once users can upload maps in M8b): at most 600 hexes counting sea (the largest draft has 408), coordinates within ±32, no duplicate hexes, name ≤ 40 and description ≤ 200 characters.
- **Map preview:** a component that draws an unresolved map: random land as a neutral "?" tile, random tokens as "?", fixed ports where they are. Used in the lobby and the sandbox picker, and by the editor later.
- **Preview while authoring:** the dev sandbox gets a map picker listing catalog maps and drafts, so a new JSON file can be seen and played locally before it's committed. Drafts are loaded only in development builds.
- **History:** game history shows each game's map name.
- **Two catalog maps** prove the path: the random base board and Grand Diamond (see Draft maps).
- **Fix `validateMapDef`:** it counts every `pool:tokens` hex but forgets that deserts drawn from the land pool get no token, so it rejects the base map itself (found while planning; it had no test). Tokens needed = `pool:tokens` hexes − deserts in `pools.land` − literal desert hexes with `pool:tokens`.
- **Drafts:** `packages/maps/maps/drafts/` holds work-in-progress maps that aren't in the catalog yet (not validated in CI, not offered in lobbies). The dev sandbox can still preview them.
- **`pnpm sim --map <id>`** runs the fuzzer on a catalog map.

**Non-scope**

- The map editor and maps saved in the database (M8b, spec 013). Uploading or sharing maps, per-lobby map options beyond the choice itself.
- Validation changes that only seafaring needs (islands, ships, gold, fog): they land with M10 as part of the seafaring module.

## Rules

- A map's `players`, `vpToWin`, `robberStart`, `constraints` and `modules` apply as written. The engine already takes the win target from the map.
- Map ids are stable: once a map is in the catalog its id never changes. Lobbies store a copy of the definition and games store the whole resolved map, so editing or removing a map file never changes a lobby or game already created.
- Display names and descriptions are our own words (IP rules).

## Engine changes

- `index.ts` exports `MODULE_IDS` (the registered module ids) so the catalog test and the server can check a map's modules. No rule changes; `createGame` already takes any resolved map and ruleset.

## Server/UI changes

- `packages/maps`: `src/catalog.ts` (`MAP_CATALOG`, `DEFAULT_MAP_ID`, `findMap`, `mapsForSeats`), `src/__tests__/catalog.test.ts`, `src/__tests__/validator.test.ts`, optional `name` / `description` and size limits on `MapDefSchema`, Grand Diamond moved out of `drafts/`.
- `packages/protocol`: `lobby:map` (`{ lobbyId, map: { builtin: id } }`; M8b adds `{ mine: id }`); `LobbyState` carries the chosen map (id, name, description, players, VP, the definition for the preview); history entries carry the map name; a new error code `UNKNOWN_MAP` (and `BAD_REQUEST` for a seat count the map doesn't allow), each with a UI message.
- `apps/server`: migration `007_lobby_map.sql` adds `lobbies.map jsonb` (null = the base map); `lobbies.ts` checks and stores the map, clears ready flags, and uses the stored map and its modules on start; history looks up the map name in the catalog by the stored map's id (falling back to the id).
- `apps/web`: a map picker on the lobby screen (host only; others see the choice), a map preview component, the map name in "Your games", and a map picker in the dev sandbox.

## Test plan

- `validator.test.ts`: `validateMapDef` accepts the base map and Grand Diamond, counts tokens correctly with deserts in the pool, and rejects a pool one token short or long; the size limits reject oversized maps.
- `catalog.test.ts`: every JSON file in `maps/` is in the catalog; ids are unique and match file names; every map has a name and description and passes the schema and validator; each generates cleanly over 1,000 seeds; player ranges are sane (1 ≤ min ≤ max ≤ 4); every listed module exists in the engine.
- Protocol: `lobby:map` payloads parse; unknown ids are left to the server.
- Server (online suite, memory and Postgres): set a non-default map, start, and the game's map and modules match; changing the map clears ready flags; an unknown map, a seat count outside the range and a non-host change are rejected; an old lobby row with no map starts on the base map.
- `pnpm sim --map <id>` runs clean on each catalog map.
- Manual: pick each map in the sandbox and in an online lobby; check the board fits and zooms (FEEDBACK #21).

## Draft maps (in `packages/maps/maps/drafts/`, reviewed)

Written by a separate session from ASCII shapes in `drafts/build.ts`; `drafts/check.ts` validates them and `drafts/preview.ts` renders `preview.html` (gitignored). The first four were reviewed with the spec; the rest were added on `m8` as candidates. All pass the schema, pool accounting and 200 generated seeds each.

| File | Name | Land hexes | VP | Modules | Playable now |
| --- | --- | --- | --- | --- | --- |
| `grand-diamond.json` | Grand Diamond | 49 | 12 | base | yes: the first catalog map |
| `twin-isles.json` | Twin Isles | 66 | 13 | base, seafaring | after seafaring (islands) |
| `world.json` | Six Shores | 82 | 14 | base, seafaring | after seafaring |
| `archipelagos.json` | Scattered Isles | 61 | 13 | base, seafaring | after seafaring |
| `crescent-bay.json` | Crescent Bay | 25 | 10 | base | yes (draft) |
| `great-hexagon.json` | Great Hexagon | 61 | 13 | base | yes (draft) |
| `hourglass.json` | Hourglass | 34 | 11 | base | yes (draft) |
| `lagoon-ring.json` | Lagoon Ring | 28 | 10 | base | yes (draft) |
| `little-harbour.json` | Little Harbour | 14 | 8 | base | yes (draft, 1–3 players) |
| `six-point-star.json` | Six-Point Star | 31 | 10 | base | yes (draft) |
| `the-boot.json` | The Boot | 25 | 10 | base | yes (draft) |
| `home-waters.json` | Home Waters | 47 | 12 | base, seafaring | after seafaring |
| `inland-sea.json` | Inland Sea | 82 | 14 | base, seafaring | after seafaring |
| `rising-chain.json` | Rising Chain | 39 | 12 | base, seafaring | after seafaring |

Review notes for when they move into the catalog:

- **Fewer 6s and 8s on big maps.** To keep the random no-adjacent-6/8 shuffle from failing, `build.ts` uses only 1–2 copies of the base token set and tops up with 4/5/9/10, so about 17% of tokens are red instead of 22%. Better: teach the generator to place red tokens first on non-adjacent hexes, then restore full copies.
- **Auto ports on multi-island maps** are spread by angle around the board centre, so two can land close together on one island (two "2:1 wheat" on Twin Isles' smaller island; overlapping labels in Six Shores around the southern peninsula). Fix the island maps' ports by hand, or spread ports per island, when seafaring lands.
- The island maps fail "land is connected", as expected; seafaring (M10) relaxes that check for maps that use it.
- Display names are our own; real place names appear only in descriptions.

## Open questions

- None. (Decided: Grand Diamond goes in the catalog first; the other base-only drafts stay drafts until they are tuned, possibly in the editor; the island maps wait for seafaring. M8a merges before M8b starts.)

## Status

In progress (M8a, on `m8`)
