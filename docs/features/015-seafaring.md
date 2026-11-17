# 015 — Seafaring: ships, gold, the pirate, and scenarios

## Goal

Players build and sail ships, settle islands and play the seafaring scenarios, following the published seafaring rulebook (2025 edition, rules on pages 2–3, scenarios on pages 4–20). The host picks "Seafaring" in the lobby, then a scenario and a setup mode (fixed or variable); the server picks the 3- or 4-player map from the seat count.

M10 is done when every scenario (1–8) and a simplified new-world variant play online. This spec covers the core rules, the scenario format, the lobby choice, and scenarios 1, 2 and 4 with their fixed maps. Fog and scenario 3 are spec 016. Variable setup is spec 017. Scenarios 5–8 and the new world each get their own spec (018–022) before they're built. The core seams are in decision record 0001.

## Scope / non-scope

**Scope**

- The seams in decision record 0001 needed now (sea graph, land helpers, `edgePieceAt` / `roadAt`, `extraActions`, `canPlace`, `onPlace`, route pieces, map regions / scenario block / markers).
- The `seafaring` module: ships (build, place in setup, Road Crew, move), gold, the pirate, Longest Trade Route, regions and island bonus VP, home regions.
- **Scenario catalog:** a scenario groups its maps (3p and 4p, fixed and variable). The lobby offers scenarios as one "Seafaring" group with a sub-choice.
- Fixed maps for scenarios 1, 2 and 4, transcribed from the rulebook diagrams, each at 3p and 4p.
- UI, protocol, sim.

**Non-scope (later specs in M10)**

- Fog and scenario 3 (016); variable setup (017); scenarios 5–8 (018–021); the new world (022).
- 5–6 players, and the rulebook's own 5–6 player maps.

## Scenario plan for M10

Display names and descriptions are our own (IP rules); the rulebook numbers are only for us.

| # | Our name | Win | Island bonus | Setup area | Extra rules | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | New Horizons | 14 VP | 2 VP per small island | main island only | none | 015 |
| 2 | Four Isles | 13 VP | 2 VP per island that isn't one of your home islands | one or two islands (they become your home islands) | none | 015 |
| 3 | Misty Passage | 12 VP | none | one or two islands | fog | 016 |
| 4 | Across the Sands | 14 VP | 2 VP per unexplored region (small islands and the strip beyond the desert) | main region only | none | 015 |
| 5 | Lost Settlers | 13 VP | none | the large island | settlements and robber only on numbered hexes; VP tokens, face-down dev cards and ports on sea edges, taken by ships; ports re-placed by the player | 018 |
| 6 | Weavers' Isles | 14 VP, or most VP once 5 villages run out of cloth | none | one or both large islands, three settlements | villages produce cloth (2 cloth = 1 VP); no settlements on small islands; no Longest Trade Route; robber and pirate limits | 019 |
| 7 | Corsair Coast | captured fortress and 10 VP | none | main island, plus a settlement and ship per player placed by the map | no robber, no awards; pirate fleet moves on a path and attacks; warships from Knights; one ship line to your fortress; fortress battles | 020 |
| 8 | Great Works | finish your wonder, or 10 VP and the highest wonder level | 1 VP per small island | large island, not on marked corners | no pirate; wonders with entry requirements and four levels | 021 |
| – | Uncharted Seas | 12 VP | 1 VP per island that isn't one of your home islands | one or two islands | random islands; ports placed automatically (simplified) | 022 |

Sub-milestones: M10a switches (014) → M10b seams → M10c seafaring core + scenario catalog + lobby + scenarios 1, 2, 4 fixed → M10d variable setup (017) → M10e fog + scenario 3 (016) → M10f–i scenarios 5–8 → M10j new world.

## Rules (rulebook pages 2–3, plus our readings)

**Ships**

- Cost 1 wood + 1 sheep; 15 per player.
- A ship goes on an empty edge that touches a sea hex or lies on the map's outer border. A road goes on an edge with land on at least one side. An edge that allows both takes a road or a ship, not both.
- **The frame:** every map is enclosed by a frame around its outermost listed hexes. Edges along the border are ordinary map edges (roads and ships may use them); nothing exists beyond them. Water inside the frame is drawn as sea hexes in the map JSON.
- A new ship must connect to one of your ships or buildings, never directly to a road, and can't continue past an opponent's building. Roads and ships connect to each other only through your own settlement or city.
- No ship may be built on an edge of the pirate's hex.
- **Setup:** if a starting settlement is on the coast, you may place a ship on an adjacent empty sea edge instead of the road.
- **Road Crew** builds two roads, two ships, or one of each, free.
- A settlement may be built at the end of a ship line, as at the end of a road.

**Moving a ship** (main step, once per turn)

- Not a ship built this turn.
- Only a ship with an open end: an end with none of your ships or buildings next to it.
- Never a ship in a continuous line of ships joining two of your buildings, even if an opponent's building now interrupts the line.
- Neither the old edge nor the new one may be an edge of the pirate's hex.
- The ship is lifted and placed again by the normal ship rules, on a different edge.

**Gold**

- On its number, a gold hex gives each adjacent settlement 1 and each city 2 cards of the player's choice.
- Everyone owed gold picks at the same time (one `GOLD_CHOICE` step, like discards), after normal production, from what the bank still has.

**The robber and the pirate**

- The robber stays on land; the pirate on sea.
- On a 7, after discards, the roller moves the robber or the pirate. Playing a Knight also moves one of them.
- The pirate moves to a different sea hex, or is parked on the frame (off the board, where it blocks nothing). On a sea hex, the mover steals 1 random card from a player with a ship on an edge of that hex (picking a player if there are several).
- The pirate blocks building and moving ships on the edges of its hex.
- A scenario without a pirate start has no pirate.

**Longest Trade Route**

- Replaces Longest Road whenever seafaring is on: 5+ continuous roads and/or ships, 2 VP, same holder rules as Longest Road. Roads and ships join one route only at your own settlement or city.

**Regions, home regions and island bonus**

- A region is a labelled area of the map (the map JSON names it); hexes without a label form one region per connected landmass.
- **Home regions** come from the map (scenarios 1 and 4: "main") or from setup (scenario 2 and the new world: the regions where you placed your starting settlements, which may differ per player).
- **Setup area:** a scenario may restrict starting settlements to listed regions.
- **Island bonus:** the first time you build a settlement in each region that isn't one of your home regions, you get the scenario's bonus (0, 1 or 2 VP), whether or not others are already there. It is computed from the pieces (settlements only ever become cities) plus your recorded home regions, never stored as a counter.

## Readings to record in ASSUMPTIONS.md

- Gold in setup: the rulebook's maps keep gold off the starting islands, but custom maps may not, so a second starting settlement next to gold gets one card of the player's choice for that hex.
- The frame: the map's outer border edges count as sea for ships (roads still need land on one side); the pirate can be parked on the frame.
- Island bonus VP isn't limited by the number of physical VP tokens in the box.
- 1–3 seat lobbies use a scenario's 3-player map; 4 seats use the 4-player map.
- A bank short of cards limits gold picks but never cancels them.

## Engine changes

**Core and base (M10b; decision record 0001)**

- `board/graph.ts`: `hexIndex`. `engine.ts`: `graphFor`, used by `createGame` and `fromSnapshot`, and exported; `allowedFor`, used by `apply` and `legalActions`.
- `module.ts`: `needsSeaGraph`; hooks `extraActions`, `canPlace`, `onPlace`, `routePieceTypes`, and their runners.
- `types.ts`: `MapInput.regions`, `MapInput.scenario`, `MapInput.markers`.
- Base: `isLandHex` / `isLandVertex` / `isLandEdge` and `edgePieceAt` / `roadAt` in `helpers.ts`; settlements, roads and the robber use them and call `canPlace`; placements call `onPlace`; `awards.ts` `longestRoute`; Road Crew's "anywhere to place?" check asks `legalActions` for the new decision instead of looking only at roads. Base exports what seafaring reuses (`steal`, the steal decision, setup road completion, `decision`, `popDecision`).
- Tests: a small two-island fixture map; sea-graph tests; base suites unchanged; a base no-change replay test.

**Seafaring module (M10c)**: `packages/engine/src/modules/seafaring/` with `index.ts`, `data.ts`, `scenario.ts` (reads and checks the map's `scenario` block), `ships.ts`, `regions.ts`, `gold.ts`, `pirate.ts`.

- `dependsOn: ["base"]`, `needsSeaGraph: true`, `routePieceTypes: ["ship"]`, registered in `modules/index.ts`.
- `extraActions`: `MAIN` + `BUILD_SHIP`, `MOVE_SHIP`; `PLACE_ROAD` + `PLACE_SHIP`; `PLACE_FREE_ROAD` + `PLACE_FREE_SHIP`; `MOVE_ROBBER` + `MOVE_PIRATE`.
- New actions: `BUILD_SHIP { edge }`, `PLACE_SHIP { edge }`, `PLACE_FREE_SHIP { edge }`, `MOVE_SHIP { from, to }`, `MOVE_PIRATE { hex: HexKey | null }` (null = the frame), `CHOOSE_GOLD { resources }`.
- Scenario block (`map.scenario`): `islandBonus` (0–2), `home` (`{ regions: [...] }` or `"setup"`), `setupRegions?`, `pirateStart?` (hex or none). 016 adds fog fields; 018–022 add their own.
- `moduleState.seafaring`: `homeRegions` (per player, from the map or recorded by `onPlace` during setup), `shipBuiltOn` (piece id → turn number), `movedOnTurn`. "This turn" compares with `turn.number`, so no end-of-turn hook is needed yet.
- `canPlace`: setup settlements only in setup regions. `vpSources`: island bonus. `produce`: gold pushes `GOLD_CHOICE` above `MAIN` (ROLL already pushes `MAIN` before producing). `defaultAction`: a random gold pick the bank can pay (reads the RNG without advancing it).
- Tests (test-first, one file per area): ship placement (sea, coast, the border, connections, opponent buildings, pirate); setup ship; Road Crew mixes; moving ships (open end, closed line, closed line split by an opponent, built this turn, once per turn, pirate both ends); gold (several players at once, bank limits, setup gold, robber on gold); pirate (move, frame, steal, Knight choice, no pirate); Longest Trade Route (mixed routes, switching only at your own buildings, broken by an opponent); regions (map-labelled, connected landmasses, home from map, home from setup, the bonus per region).

## Server/UI changes

- **`packages/maps`:**
  - Schema: hex `region` labels; the `scenario` block (zod per field, shared with the engine's reader); `markers`; `robberStart` may be a hex, a terrain or a token number (scenario 1's 3p variable setup starts on the 12).
  - Scenario catalog: `packages/maps/scenarios/<id>/` holds `3p-fixed.json`, `4p-fixed.json` (and `-variable` from 017). `SCENARIO_CATALOG` lists each scenario's id, name, description, rulebook order and variants; `scenarioMap(id, seats, setup)` picks the map. Base maps stay in `MAP_CATALOG`.
  - Validator: island maps may have several landmasses; every named region exists; setup and home regions exist; the pirate starts on sea; ports sit on coast edges.
  - Transcription: each fixed map is entered from the rulebook diagram with a small helper that turns a row-by-row text grid into hex JSON, then checked against the rulebook's component counts (hexes, number discs, ports per type) in a test, and by eye in the sandbox preview.
- **`packages/protocol`:** zod schemas for the new actions. `lobby:map` takes `{ builtin: id }` or `{ scenario: id, setup: "fixed" | "variable" }`. `LobbyState` shows the scenario, the setup mode and the map variant the seat count gives.
- **`apps/server`:** the lobby stores the chosen scenario and setup mode (migration `009_lobby_scenario.sql`) and resolves the map at start from the seat count. `GOLD_CHOICE` is a `timer: "short"` decision like discards. No rules.
- **`apps/web`:** the lobby map picker gets a "Seafaring" group: pick a scenario (name, description, VP target, preview of the map for this seat count), then Fixed or Variable. In game: the graph from `graphFor`; ships (a hull in the seat colour), the pirate (a dark ship), gold hexes, a drawn frame around the map, all ship targets from `legal`; a Ship build button; move a ship by tapping one of your movable ships, then a target; after a 7 or a Knight the robber and pirate targets light up together, plus a "send the pirate away" button for the frame; gold picks reuse the card tray; "Longest Trade Route" badge; island bonus in the VP breakdown; region outlines on the board; sounds for ships and the pirate. The dev sandbox lists scenarios.
- **`tools/sim`:** `--scenario <id> --setup fixed|variable`; invariants: ship limit, robber only on land, pirate only on sea or the frame, island bonus matches regions.

## Test plan

- Engine: the tests above; invariants and replay determinism on each scenario map.
- Maps: each fixed map matches the rulebook's component counts and validates; validator cases for island maps.
- Protocol: new actions and `lobby:map` forms parse; malformed ones fail.
- Server (online suite): a 4-seat lobby on scenario 1 gets the 4p map; a 2-seat lobby gets the 3p map; a ship build and a gold pick go through.
- `pnpm sim --games 2000 --seed 1` on the base map and on scenarios 1, 2, 4 run clean.
- Manual: each scenario in the sandbox and online; check each map against its rulebook diagram.

## Notes for the map editor (M8b)

- A map meant for seafaring must say where starting settlements may go: the editor lets the author select one or more landmasses (regions) as the setup area, or choose "players pick their home islands in setup" (scenario 2 style). The validator rejects a seafaring map with neither.
- The editor draws the frame around the outermost hexes and only lets sea and land go inside it.

## Open questions

- None. (Decided: the scenario names above; gold next to a starting settlement is a player's choice; the map has a frame; its border edges are buildable, nothing beyond it exists.)

## Status

In progress (M10c, on `m10`). Built: the core seams, the seafaring module, scenarios 1, 2 and 4 with their fixed maps, the lobby and sandbox pickers, the board and controls, the fuzzer. Left: an online playtest. As built, `pirateStart` may also be `"frame"` (scenarios 2 and 4 start the pirate off the board), lobbies need no new column (the stored map's id names the scenario and setup), and ships, the pirate and island bonuses reuse the build, robber and award sounds.
