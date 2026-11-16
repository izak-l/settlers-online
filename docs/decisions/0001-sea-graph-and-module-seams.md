# 0001 — Sea graph and module seams for seafaring

## Context

Seafaring (M10) is the first module after `base`, and it isn't one ruleset: the rulebook has eight scenarios plus a random "new world" variant. Scenarios 1–4 use only the seafaring rules (ships, gold, pirate, island bonus, fog). Scenarios 5–8 add their own pieces and rules: tokens and cards lying on sea edges, ports that move, cloth, a pirate fleet on a fixed path, warships, fortresses, wonders, and win conditions other than "reach the VP target".

Several things in the core and base module stop this from being added purely as modules:

1. **The board graph has no sea.** `createGame`, `fromSnapshot` and the web board build the graph from land hexes only. Ships need edges and corners between sea hexes.
2. **Base treats every edge piece as a road.** `roadAt` matches any piece on an edge, so connections, settlement placement and Longest Road would count ships.
3. **Decisions fix their action lists.** Base builds `MAIN`, `MOVE_ROBBER`, `PLACE_ROAD` and `PLACE_FREE_ROAD` with a hard-coded `allowed` list, and `apply` rejects anything else before any module sees it.
4. **Placement, routes and wins are closed.** Scenarios restrict where settlements, ships and the robber may go, react when a piece reaches a hex or edge, count ships in the longest route, and replace the win rule.
5. **The map carries no scenario data.** There is nowhere to mark regions, home islands, the pirate's start, or tokens lying on edges and corners.

The rule for seams (DESIGN §14) is to generalize the core only when a module needs it. This record names every seam M10 will need, so the M10c design doesn't block scenarios 5–8, but each seam lands with the first scenario that uses it.

## Decision

**Seams added in M10b (needed by the seafaring rules and scenarios 1–4)**

- **Sea graph on demand.** `RulesModule.needsSeaGraph?: boolean`. A core `graphFor(map, moduleIds)` builds the graph from every listed hex (sea and fog included) when any module asks, and from land only otherwise. `createGame`, `fromSnapshot` and the web client all call it, so the base graph (19 hexes, 54 vertices, 72 edges) is unchanged. The graph's shape never depends on terrain, so revealing a fog hex changes `state.map`, not the graph. The graph gains `hexIndex` (hex key → index in `map.hexes`). The listed hexes are enclosed by a frame: edges along the border are ordinary edges (roads, ships and ports use them), and nothing beyond the listed hexes exists.
- **Land is read from the map, not the graph.** Base helpers `isLandHex`, `isLandVertex` and `isLandEdge` (touches at least one land hex) read terrain from `state.map`. Base candidates and validation for settlements, roads and the robber use them. On a land-only graph they are always true, so base behaviour doesn't change.
- **Edge occupancy vs roads.** `edgePieceAt(state, edge)` (any piece: one per edge) and `roadAt(state, edge)` (type `road` only).
- **`extraActions` hook:** `Partial<Record<DecisionKind, ActionType[]>>`. The core's `allowedFor(state, decision)` is the decision's own `allowed` plus every module's extras for its `kind`; `apply` and `legalActions` both use it.
- **`canPlace` hook:** `(state, player, pieceType, location, decisionKind) → Rejection | null`. Every module must agree. Base calls it after its own checks for settlements, roads and the robber.
- **`onPlace` hook:** `(draft, piece, events, modules) → void`, run after any piece is placed or moved (base builds, setup placements, free roads, the robber, and module pieces).
- **Route pieces:** `routePieceTypes?: PieceTypeId[]`, collected across modules (base: `road`). Base's `longestRoad` becomes `longestRoute`: a walk over the player's route pieces that can't pass through an opponent's building, and can switch piece type at a corner only where the player has their own building. With roads only it is the current algorithm.
- **Scenario data on the map.** `MapInput` gains optional `regions` (hex → region label, from the map JSON), `scenario` (a free-form block each module reads and validates for itself: island bonus, home rule, fog pools, pirate start, …) and `markers` (things lying on a hex, edge or corner: `{ id, kind, at, data? }`). The core only carries them; modules give them meaning.

**Seams named now, added with the scenario that needs them (M10f–i)**

| Seam | First user | What it is |
| --- | --- | --- |
| Handler precedence | 5, 7 | A module later in the ruleset may replace an earlier module's action handler (e.g. a Knight that only converts ships). Today the first module wins. |
| `checkWin` replacement | 6, 7, 8 | A scenario's win rule replaces base's (e.g. "fortress captured and 10 VP"), and may name a winner who isn't the active player at the end of a turn. Like `rollDice`, the last module that defines it decides. |
| `afterRoll` hook | 7 | Runs after the dice and before production or the 7 (the pirate fleet moves and attacks). |
| `onTurnEnd` hook | 6, 7 | Runs when a turn ends (end-of-turn win check; attacking a fortress). |
| Setup sequence | 6, 7 | A module builds the setup decisions (three starting settlements; pieces placed for each seat by the map). |
| Ports as state | 5 | Ports move into the state (`state.ports`, copied from the map at start), so a module can pick one up and place it elsewhere. `tradeRatio` reads the state. |
| Piece `attrs` | 7 | `Piece.attrs?: Record<string, unknown>` (a ship that is a warship). |
| Deck changes | 5, 7 | Modules adjust the dev deck in their `setup` (after base's), and can deal a card face down onto a marker. Face-down cards on the board live in a hidden zone, so `viewFor` still hides them. |

Every seam lands with a base no-change test: the existing suites pass untouched, and a scripted base game replays to the same final state before and after.

## Consequences

- Seafaring and its scenarios need no `if (seafaring)` anywhere in the core or base module. Scenarios 1–4 are data on the `seafaring` module; scenarios 5–8 are each a small module that depends on it.
- Base queries pay a small cost for land checks; on base maps they are trivially true.
- The web client must build its graph with `graphFor(view.map, view.modules)` instead of filtering out sea itself.
- Later expansions reuse the seams: knights-and-cities adds actions to `MAIN` through `extraActions` and replaces dev cards; explorers uses `onPlace`, markers and the sea graph.
- DESIGN §4 (graph) and §6 (hooks) are updated when this record is accepted.

## Status

Proposed
