# Settlers Online — Engine & System Design

Nov 15, 2026 · @....

## 1. Goals and constraints

Build a free, self-hosted, browser-based hex-tile trading and building game for a private friend group, using the publicly known base ruleset. The engine must support arbitrary maps and later expansions without a rewrite.

**Goals**

- Real-time online play for 3–4 players (5–6 later), on desktop and phone browsers.
- A server-authoritative rules engine that is deterministic and fully tested.
- Maps defined as data: random base boards, fixed layouts and custom maps from an editor.
- Expansion-ready seams (modules, a decision queue, keyed resources) built in from v1. v1 ships the base game; expansions follow in order from v1.1 (section 14).
- Accounts from v1: sign-in, friends list, online status, private lobbies and game history. Plus reconnect, save/resume, replays and spectators.

**Non-goals for v1**

- Public matchmaking, ranked play, monetization.
- AI opponents beyond simple random bots for testing.
- Hot-seat or single-device play. Every player joins from their own browser; the only local mode is a developer sandbox.
- Expansions in the v1 release itself (work starts right after, in v1.1).

**Naming and IP rules**

- Name: Settlers Online. Never use the trademarked name, logos, official art, card text or scenario text.
- All art, icons and copy are original. Generic terms (settlement, city, road, robber, knight) are fine.
- Map layouts may be recreated as data; scenario names and flavor text may not.
- Private deployment for friends only.

## 2. Architecture overview

The server owns the truth: clients send intents, the server validates them with a pure engine, appends them to a log, and broadcasts per-player views.

**Request flow**

1. Client sends an intent, e.g. `{ type: "BUILD_ROAD", edgeId }`.
2. Server loads the room's current state and calls `engine.apply(state, action, ctx)`.
3. On error, only the sender gets a rejection with a reason code.
4. On success, the server appends the action to the game's event log, stores the new state, and sends each player `engine.viewFor(state, playerId)`.

**Principles**

- **Pure engine.** No I/O, no `Date.now()`, no `Math.random()`. Randomness comes from a seeded PRNG (e.g. xoshiro128\*\*) whose state lives inside `GameState`, so snapshots resume exactly. Same seed + same actions = same game.
- **Event sourcing.** The log (seed, ruleset, map, actions) is the source of truth. State snapshots are a cache for speed.
- **Shared code.** The same engine package runs on the client to show legal moves and highlight placements. The client never applies moves to authoritative state.
- **Thin server.** Rooms, sockets, persistence and filtering views. No game rules live in the server package.

## 3. Tech stack and repo layout

TypeScript everywhere, in one pnpm-workspace monorepo, so the engine's types are shared by server and client.

| Package | Tech | Responsibility |
| --- | --- | --- |
| `packages/engine` | TypeScript, no runtime deps | Board graph, state, actions, rules modules, views |
| `packages/maps` | JSON + zod schemas | Map definitions, validation, generators |
| `packages/protocol` | TypeScript + zod | Client↔server message types and validation |
| `apps/server` | Node, Socket.IO, Postgres + Auth (Supabase free tier) | Rooms, sockets, token checks, presence, persistence, view filtering |
| `apps/web` | React, Vite, Zustand, SVG | Lobby, board, hand, trades, log, chat |
| `tools/sim` | Node script | Seeded bot games for fuzz testing |

Tooling: Vitest for tests, fast-check for property tests, ESLint + Prettier, strict `tsconfig`.

We write our own engine rather than use boardgame.io. The rules engine is the core work either way, and owning it keeps the decision queue and module system under our control.

## 4. Board model

A map is data. The engine derives the vertex and edge graph from whatever set of hexes it is given, so there are no hardcoded board sizes. The base board happens to produce 19 hexes, 54 vertices and 72 edges, which is a test assertion, not a constant.

**Coordinates and IDs**

- Hexes use axial coordinates `(q, r)`, pointy-top.
- Vertex ID = the three hex coordinates that touch it, sorted and joined (e.g. `0,0|1,-1|1,0`). Off-board neighbor coordinates still count, so coastal vertices get unique IDs.
- Edge ID = the two hex coordinates that share it, sorted and joined.
- These IDs are stable across any map shape and need no special cases.

**Derived graph (built once per game)**

- `hex → vertices[6]`, `hex → edges[6]`
- `vertex → hexes[≤3]`, `vertex → edges[≤3]`, `vertex → neighborVertices[≤3]`
- `edge → vertices[2]`, `edge → hexes[≤2]`
- Vertices and edges are only created for hexes marked as land or coast. Sea-only edges exist only when a module needs them (ships).

**Map definition**

```json
{
  "id": "base-4p",
  "version": 1,
  "players": { "min": 3, "max": 4 },
  "vpToWin": 10,
  "hexes": [
    { "q": 0, "r": 0, "terrain": "pool:land", "token": "pool:tokens" },
    { "q": 0, "r": -3, "terrain": "sea" }
  ],
  "pools": {
    "land": { "forest": 4, "pasture": 4, "fields": 4, "hills": 3, "mountains": 3, "desert": 1 },
    "tokens": [2,3,3,4,4,5,5,6,6,8,8,9,9,10,10,11,11,12],
    "ports": { "any3to1": 4, "wood2to1": 1, "brick2to1": 1, "sheep2to1": 1, "wheat2to1": 1, "ore2to1": 1 }
  },
  "ports": [ { "edge": "auto", "type": "pool:ports" } ],
  "robberStart": "desert",
  "constraints": ["no-adjacent-red-tokens"],
  "modules": ["base"]
}
```

- Terrain and tokens are either fixed values or `pool:<name>` draws, so one format covers random boards, fixed layouts and mixed ones.
- Terrain types map to a resource through the ruleset (`forest → wood`), so new terrains (gold, fog) are just data plus a module.
- Hidden hexes (`"hidden": true`) are revealed by the server at the moment of discovery, drawing from a pool with the game RNG.
- `constraints` names validators run during generation; a rejected board is regenerated with the next RNG draw.
- A map validator checks that the land is connected, that pool counts match the slots, and that every port sits on a coastal edge. The map editor uses the same validator.

## 5. Engine core

The engine is one reducer driven by a stack of pending decisions. It does not use a fixed phase enum, so expansions can add interruptions without touching the core.

**Reducer contract**

```ts
type Actor = PlayerId | "system";   // "system" = timeouts and other server-forced moves

type Result =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; code: ErrorCode; message: string };

function createGame(map: MapDef, ruleset: RulesetDef, seats: PlayerId[], seed: string): GameState;
function apply(state: GameState, actor: Actor, action: Action): Result;  // draws from state.rng
function legalActions(state: GameState, playerId: PlayerId): ActionSpec[];
function viewFor(state: GameState, viewer: PlayerId | "spectator"): PlayerView;
function defaultAction(state: GameState, playerId: PlayerId): Action;    // used on timeout
```

- `apply` never mutates its input. It validates against the untouched state, then deep-copies it (the graph is shared, since it is never mutated) and lets the handler change the copy.
- `events` are human-readable facts for the game log ("P2 rolled 8", "P1 stole from P3"). The log UI is built from events, never from diffing state.

**State shape**

```ts
interface GameState {
  rulesetId: string;            // e.g. "base@1"
  options: GameOptions;         // vpToWin, timer, enabled features
  rng: RngState;                // serializable PRNG state
  map: ResolvedMap;             // hexes with terrain/tokens resolved
  graph: BoardGraph;            // derived, can be rebuilt from map
  players: Player[];            // seat order
  pieces: Record<PieceId, Piece>;
  zones: Record<ZoneId, Zone>;  // hands, decks, bank, played cards
  turn: { number: number; activePlayer: PlayerId };
  decisions: Decision[];        // stack; top = what must happen next
  moduleState: Record<ModuleId, unknown>;
  winner?: PlayerId;
}

interface Piece { id; type: PieceTypeId; owner?: PlayerId; at: { vertex | edge | hex }; attrs: Record<string, unknown> }
interface Zone  { id; owner?: PlayerId; visibility: "public" | "owner" | "count" | "hidden"; contents: Record<ItemId, number> | ItemId[] }
```

- Resources and commodities are keyed strings, never fixed fields.
- Cards are zones too: a player's hand is a zone, the dev deck is an ordered zone, the bank is a zone.

**Decision queue**

```ts
interface Decision {
  kind: string;                 // "ROLL", "MAIN", "DISCARD", "MOVE_ROBBER", "STEAL", "PLACE_FREE_ROAD"...
  actors: PlayerId[];           // who must act (can be several at once)
  pendingFrom: PlayerId[];      // who hasn't acted yet
  allowed: ActionType[];
  data?: unknown;               // e.g. discard counts per player
  module: ModuleId;             // who owns the resolution logic
}
```

- A normal turn is `ROLL` then `MAIN`. Rolling a 7 pushes `DISCARD` (all affected players at once), then `MOVE_ROBBER`, then `STEAL`.
- When the top decision is fully resolved it pops, and play continues with the one below.
- Every action is validated against the top decision first, then by the owning module's validator.
- Setup is just a scripted sequence of `PLACE_SETTLEMENT` / `PLACE_ROAD` decisions in snake order.

**As built (M2)**

- The stack is `GameState.decisions`; the last element is the top. `createGame` pushes the whole setup sequence over p0's first `ROLL`, so the stack is never empty. Placing a setup settlement writes `mustTouch` into the road decision below it.
- `apply` checks, in order: game over → the top decision allows the action type (`WRONG_DECISION`) → the player is in `pendingFrom` (`NOT_YOUR_TURN`; the `system` actor acts for `pendingFrom[0]`) → the handler's `validate`. Build actions check piece limit, then cost, then placement.
- `turn.number` is 0 during setup and 1 on the first `ROLL`. `END_TURN` pops `MAIN`, advances the seat, and pushes the next player's `ROLL`.
- The engine takes a `MapInput` (every pool already resolved). `@settlers/maps`' `ResolvedMap` fits it structurally; the engine doesn't depend on the maps package.
- `GameState` stores module ids, not module code. `MODULES` in `packages/engine/src/modules/index.ts` maps ids to modules. `graph` is derived and uses `Map`/`Set`, so persistence (M4) must drop it and rebuild it with `buildGraph`.
- Zones hold `Record<ResourceId, number>` for now; ordered card zones arrive with dev cards (M5).
- `viewFor` returns a `PlayerView`: the state minus `rng` and `graph`, with zones redacted (`public`: contents; `count`: contents for the owner, a count for others; `owner`: contents for the owner only; `hidden`: a count only).
- `defaultAction` ends the turn when `END_TURN` is allowed; otherwise it takes the first legal action. Random timeout defaults (discards, robber) come in M5.
- A roll of 7 currently produces nothing and pushes nothing; discards, robber and steal come in M5.

## 6. Rules modules and hooks

Every rule lives in a module, and the base game is itself a module. A ruleset is an ordered list of modules plus options. This proves the hook API on day one and keeps `if (expansion)` checks out of the core.

```ts
interface RulesModule {
  id: ModuleId; version: number;
  dependsOn?: ModuleId[];
  resources?: ResourceDef[];        // adds keyed resources/commodities
  pieceTypes?: PieceTypeDef[];      // where it goes, cost, limits, attrs
  decks?: DeckDef[];
  costs?: Record<string, Cost>;
  actions?: Record<ActionType, ActionHandler>; // validate + apply
  hooks?: Partial<Hooks>;
  setup?(state, options): void;
}
```

**Hooks (initial set)**

| Hook | Called when | Base game use |
| --- | --- | --- |
| `onGameStart` | after map resolved | build bank, shuffle dev deck |
| `rollDice` | ROLL action | two d6 → `{ red, yellow }` |
| `onRoll` | after dice | 7 → push discard/robber/steal |
| `produce` | non-7 roll | hexes → resources, bank shortage rule |
| `canPlace` | any placement | distance rule, connectivity |
| `onBuild` | after placement | recompute Longest Road |
| `tradeRatio` | bank trade | 4:1, port 3:1 / 2:1 |
| `vpSources` | any VP check | buildings, VP cards, road, army |
| `checkWin` | end of each action | active player ≥ `vpToWin` |
| `routeGraph` | Longest Road | roads only (ships add edge types) |
| `redact` | `viewFor` | hide hands, dev cards |

- Hooks run in ruleset order. A hook returns either a value (for queries like `tradeRatio`, results are combined: min ratio, summed VP) or state changes.
- Victory points are always computed from `vpSources`, never stored as a counter.
- Dice results are an object, so an event die or a chosen roll fits later.

**As built (M2)**

- An action handler is `{ validate, apply, candidates }`. `validate` sees the untouched state; `apply` mutates the draft copy and pushes events. `legalActions` is `candidates` filtered by `validate`, so the UI's highlights and the server's checks can't disagree.
- The handler for an action comes from the top decision's module first, then from the first module in ruleset order that has one.
- Hooks implemented so far: `rollDice` (the last module that defines it wins), `produce` (every module runs, in order) and `vpSources` (summed). `setup` plays the role of `onGameStart`. The other hooks in the table are added when the milestone that needs them lands, per the seam rule in section 14.
- Costs, piece limits and the terrain → resource table are constants in the base module for now; `pieceTypes` / `costs` on the module interface wait until an expansion needs to change them.

## 7. Base game rules checklist

The base module implements the rules below. Each item needs at least one engine test; tick it off when tested.

**Costs and limits**

| Item | Cost | Per-player limit |
| --- | --- | --- |
| Road | 1 wood, 1 brick | 15 |
| Settlement | 1 wood, 1 brick, 1 wheat, 1 sheep | 5 |
| City (replaces settlement) | 2 wheat, 3 ore | 4 |
| Dev card | 1 sheep, 1 wheat, 1 ore | deck of 25 |

Bank: 19 of each resource. Dev deck: 14 Knight, 5 Victory Point, 2 Road Building, 2 Year of Plenty, 2 Monopoly.

**Setup**

- [x] Snake order: 1→N places settlement + road, then N→1.
- [x] Second settlement grants one of each resource from its adjacent hexes.
- [x] Robber starts on the desert.

**Turn and production**

- [x] Roll two dice; every hex with that token (and no robber) pays 1 per settlement, 2 per city.
- [x] Bank shortage: if the bank can't pay everyone owed a resource, nobody gets it, unless only one player is owed it (they get what remains).
- [ ] Roll of 7: every player with 8+ cards discards half, rounded down, simultaneously.
- [ ] Robber must move to a different hex; active player steals one random card from a player with a building on it (if any have cards).

**Building**

- [x] Distance rule: no settlement on a vertex adjacent to any other settlement or city.
- [x] Roads connect to your own road or building; settlements (after setup) connect to your own road.
- [x] An opponent's settlement blocks road continuation through that vertex.

**Dev cards**

- [ ] Max one dev card played per turn, and not one bought that turn. VP cards are exempt.
- [ ] Dev cards may be played before rolling.
- [ ] Knight: move robber + steal. Road Building: 2 free roads. Year of Plenty: any 2 from bank. Monopoly: all cards of one resource from every player.

**Trading**

- [ ] Players trade only with the active player, during the main step.
- [ ] No gifts: both sides must give at least one card.
- [ ] Bank 4:1, generic port 3:1, specific port 2:1 for its resource.

**Awards and winning**

- [ ] Longest Road: 5+ continuous segments, 2 VP. Ties keep the current holder. If the holder is broken and others tie for longest, nobody holds it.
- [ ] Largest Army: 3+ knights played, 2 VP. A challenger must exceed the holder.
- [ ] Win at `vpToWin` (10), checked only for the active player during their turn. Hidden VP cards count.

## 8. Networking and hidden information

One Socket.IO connection per signed-in client; every message is a typed, zod-validated JSON envelope defined in `packages/protocol`.

**Messages**

| Direction | Type | Payload |
| --- | --- | --- |
| C→S | `join` | lobby id (user comes from the auth token on the handshake) |
| C→S | `action` | `Action`, client sequence number |
| C→S | `chat` | text |
| S→C | `welcome` | seat id or spectator, full view |
| S→C | `state` | full `PlayerView` + that player's `legal` actions + public `scores` + server sequence number + new events |
| S→C | `rejected` | client sequence number, reason code |
| S→C | `lobby` | seats, ready flags, chosen map and ruleset |

- v1 sends the full filtered view on every change. Board state is small (a few KB), so diffs aren't worth the complexity yet.
- `legalActions` and `computeVP` need the full `GameState`, which clients never get, so the server computes both and sends them with the view. The client highlights moves from `legal` and never works out legality itself.
- Each game processes actions one at a time through a per-game queue, so two clicks can't race.

**Hidden information**

- `viewFor` applies zone visibility: `owner` zones show contents only to their owner; `count` zones show only a number to others; `hidden` zones (deck order) show only a count to everyone.
- Stolen cards: the thief and victim see which resource; others see only that a card moved.
- All RNG runs on the server. The seed is never sent to clients until the game ends.

**Accounts, lobbies, spectators and timers**

- **Auth:** Supabase Auth with email + password (email confirmation and password reset included), Google and Discord. The web app signs in with the Supabase client; the game server never handles passwords. On first sign-in the user picks a unique username. Supabase's built-in email sender is rate-limited and meant for testing, so add a custom SMTP provider before inviting many friends.
- The server verifies the Supabase access token (JWT) on the Socket.IO handshake and binds the socket to a `userId`.
- **The engine stays account-agnostic.** It only knows seats (`PlayerId`). The server maps seat → `userId` in `game_players`.
- **Tables:** `profiles` (id = Supabase auth user id, unique username, display name, avatar), `friendships` (user, friend, status), `lobbies` (id, host, visibility, settings), `game_players` (game, seat, user).
- **Presence:** connected sockets mark a user online / in lobby / in game; friends get presence updates.
- **Lobbies:** private by default, joined by invite link or a friend invite. The host picks map, modules, player count, timer and whether spectators are allowed.
- **Reconnect:** signing in again reclaims your seat; seats stay reserved while disconnected.
- **Spectators:** get `viewFor("spectator")`, which shows public information only (hand counts, no contents). Spectator chat is a separate channel. Full reveal is available in the replay after the game ends.
- **Turn timer:** configurable per lobby (off, or N seconds per turn, with a shorter timer for discards). On timeout the turn ends. If a decision is still pending, the server first applies a default: random discards, robber to a random legal hex with a random steal, open trade offers cancelled, unplaced free roads forfeited.
- Timeout defaults are logged as normal actions from a `system` actor and use the game RNG, so replays stay deterministic.

## 9. Persistence, versioning and replay

Postgres stores each game as a header plus an append-only action log; snapshots are only a speed cache.

- `games`: id, lobby id, created/ended, map definition (inline JSON), ruleset (module ids + versions), seed, status.
- `actions`: game id, sequence number, actor (seat or system), action JSON, timestamp.
- `snapshots`: game id, sequence number, state JSON, written every N actions and on game end.
- On server restart, rooms resume by loading the latest snapshot and replaying later actions.
- Each module has a `version`. A saved game replays with the module versions it was created with; if a version is no longer available, the game opens read-only from its last snapshot.
- Replay viewer (later): step through the action log with full visibility after the game ends.

## 10. Frontend

React renders the board as one SVG; the client holds only the latest `PlayerView` and uses the shared engine to show legal moves.

- **Board:** hexes as polygons, number tokens, ports on edges. Vertices and edges are invisible hit targets that light up when `legalActions` allows a placement there.
- **Panels:** your hand and dev cards, build buttons with costs, opponents (card counts, VP shown, awards), dice, game log, chat.
- **Trading:** offer builder (give / want), incoming offers with accept/decline, bank and port trades with the best ratio pre-filled.
- **Modals driven by the decision stack:** discard picker, robber placement, steal target, Year of Plenty / Monopoly pickers.
- **State:** Zustand store holds the view and connection status. Optimistic UI is not used; the board updates when the server confirms.
- **Mobile:** board pans and zooms; panels collapse into a bottom drawer.
- **Art:** original flat SVG icons and a custom color palette. No borrowed assets.
- **Map editor (later):** click hexes to set terrain, tokens and ports; validates with the shared map validator; exports map JSON.

**As built (M3: board UI)**

- Components only see a `GameClient` (`apps/web/src/game/LocalGame.ts`): `snapshot()` → `{ seat, view, legal, scores, log }` and `send(action)`. In M4 a socket client implements it for online play, and the components don't change.
- `LocalGame` implements `GameClient` with the engine running in the tab. It powers the **dev sandbox** (`pnpm dev`, development builds only), where one person acts for whichever seat is being waited on, and the web tests. It is not a player-facing mode; production builds show a placeholder until online play lands.
- The board draws a vertex at the average of its three hex centres and an edge between its two vertices, so positions come straight from the IDs. Views don't carry the graph; the client rebuilds it from `view.map` once.
- Clickable targets are exactly the actions in `legal`. During setup every legal placement lights up; in the main step the Road / Settlement / City buttons pick which kind, and a button is disabled when `legal` has none of that kind. Targets are keyboard-focusable buttons.
- Not yet: lobbies and sign-in (M4); the robber, dev cards, trades and the win screen (M5); pan/zoom, mobile layout and animations (M6).
- **Account and lobby screens:** sign-in (email, Google, Discord), pick a username, friends list with presence, lobby setup, and a spectate button on friends' live games.

## 11. Testing strategy

The engine is tested hardest, because a rules bug ruins a game and the engine is pure and easy to test.

- **Unit tests per rule** on small, hand-built fixture boards (a map JSON plus a scripted action list).
- **Graph tests:** base map gives 19 hexes, 54 vertices, 72 edges; every vertex touches ≤3 hexes; IDs are stable across rebuilds.
- **Longest Road suite:** loops, forks, branches, roads broken by an opponent's settlement, ties, losing the award.
- **Bot fuzzing (`tools/sim`):** random-legal-move bots play thousands of seeded games. After every action, assert invariants:
  - total of each resource across bank and hands is constant (19);
  - no negative counts; piece limits respected;
  - computed VP matches pieces and cards;
  - the decision stack is never empty before game end;
  - every game ends or hits a turn cap without throwing.
- **Replay determinism:** replaying any logged game from its seed produces an identical final state.
- **Redaction tests:** `viewFor` never leaks another player's hand contents, dev cards or deck order.
- A failing fuzz seed becomes a permanent regression test.

## 12. Hosting and ops

Target cost is $0 on free tiers. The two catches are that idle servers sleep (dropping sockets until the next visit wakes them) and their local disks don't persist, so the server keeps no state on disk.

- **Frontend:** Cloudflare Pages (static build of `apps/web`).
- **Game server:** a free-tier container host such as Render. Check current limits; expect a cold start of up to a minute after idle, which is fine for planned game nights.
- **Database + auth:** Supabase free tier. Free projects pause after a stretch of inactivity, so regular play or a weekly ping keeps it awake.
- Every action is written to Postgres before it's broadcast, so a restart or sleep loses nothing; rooms rebuild from snapshot + log on wake.
- Health check endpoint, structured logs, and an admin page listing active lobbies.
- **Upgrade path:** if sleeping gets annoying, move the server to a cheap VPS or a home machine behind a Cloudflare Tunnel with no code changes.

## 13. Milestones

Each milestone ends with something playable or testable; don't start the next until its acceptance criteria pass.

Online play comes before the remaining rules (M4 before M5), so friends can play real online games early and every rule added afterwards ships straight into online play. The engine doesn't depend on the server, so the order is safe. There is no hot-seat mode.

| # | Milestone | Done when |
| --- | --- | --- |
| M0 | Monorepo, CI, lint, test runner | `pnpm test` runs green in CI |
| M1 | Board graph + map loader + base map generator | Graph tests pass; red-token constraint holds over 10k seeds |
| M2 | Engine core: decision stack, module system, setup, roll, produce, build | Scripted setup + 10 turns in a test; resource conservation holds |
| M3 | Board UI against a `GameClient`, with a local dev sandbox | Setup and turns playable in the sandbox minus robber, dev cards, trades |
| M4 | Socket.IO server, accounts, lobbies, spectators, views, reconnect, Postgres log | 4 signed-in players + 1 spectator play 10 turns online, each in their own browser; refresh mid-game recovers the seat |
| M5 | Robber, dev cards, bank/port/player trades, awards, win | Every box in section 7 ticked; fuzzer runs 10k games clean; an online game finishes with a winner |
| M6 | Friends list, presence, invites, game history; polish: log, chat, animations, mobile layout, turn timers | Friends play a full game on phones without help |
| M7 | Deploy | Live on free tiers; survives a server sleep mid-game |
| M8+ | Map editor, then expansions in order: v1.1 seafaring, v1.2 knights-and-cities, v1.3 traders scenarios, v1.4 explorers (section 14) | See section 14 |

## 14. Expansion roadmap and open questions

Expansions are added as modules on top of `base`; each row lists what the module adds through the seams already in the core.

| Order | Module | Adds | Seams it uses |
| --- | --- | --- | --- |
| v1.1 | `seafaring` | sea edges, ships (build, move an open end), offshore islands with bonus VP, gold hexes, fog hexes revealed on discovery, pirate, a set of scenario maps | map JSON, piece types, `routeGraph` with mixed road/ship edges, hidden hexes, `produce`, `vpSources` |
| v1.2 | `knights-and-cities` | commodities, three city-improvement tracks with abilities, knights (levels, activation, moving, displacing), event die, barbarian track and attacks, three progress decks, metropolises, city walls, merchant, higher VP target | keyed resources, `rollDice` object, decks as zones, multi-player decisions, hand-limit hook, `vpSources`; turns off base dev cards and Largest Army |
| v1.3 | `traders` scenarios | each scenario is its own small module (e.g. fishermen, rivers, caravans, barbarian attack, the main traders scenario), plus variants like an event deck in place of dice | scenario modules, new piece types, `rollDice` override, scenario-specific `vpSources` |
| v1.4 | `explorers` | ships carrying settlers and crews, harbor settlements, missions with their own VP tracks, fog exploration, scenario-specific VP targets | movable pieces with cargo `attrs`, hidden hexes, new decision kinds, `vpSources`; turns off several base features |

- **New seam this order needs:** the base module is split into toggleable features (`devCards`, `robber`, `longestRoad`, `largestArmy`, `ports`), because later modules switch some of them off.
- **Build the map editor before seafaring.** Seafaring is mostly fixed scenario maps, and entering them as data is the bulk of that work.
- Module ids stay internal. Display names and all scenario text in the UI are our own wording.

**Rule for adding a seam:** only generalize the core when a module actually needs it, and add a test in the base module proving nothing changed.

**First seafaring scenario (assumptions to check against the rulebook)**

v1.1 ships the introductory scenario: the familiar main island plus four small islands, so players learn ships without extra scenario rules.

- **Map:** main island laid out like the base board; four small islands, each one sea hex away. 3–4 players. Fixed layout entered as map JSON; no fog hexes yet.
- **Win:** 13 VP.
- **Setup:** starting settlements only on the main island.
- **Island bonus:** a player's first settlement on each small island earns special VP. The amount is a map setting, defaulting to 2 (sources differ between 1 and 2 by edition).
- **Gold hexes** (on small islands): each payout is any resource the player picks, resolved as a pending decision.
- **Pirate and robber** are both in play. On a 7 or a Knight the player picks which to move. The pirate sits on a sea hex, steals from a player with a ship next to it, and blocks building or moving ships next to it.
- **Ships:** cost 1 wood + 1 sheep, 15 per player, placed on edges that touch sea. A ship line starts at your coastal settlement or city or extends your ships. Roads and ships connect only through your own settlement or city.
- **Moving ships:** one per turn, only the open end of a route, not a ship built this turn, and never a ship in a closed route between two of your buildings.
- **Longest Road becomes Longest Trade Route**, counting roads and ships together.
- **Road Building** lets you place two roads, two ships, or one of each.

**Decisions**

- Name: Settlers Online.
- Realtime transport: Socket.IO.
- Hosting: free tiers (section 12).
- Spectators: supported in v1.
- Turn timer: configurable per lobby; on timeout the turn ends (defaults in section 8).
- Sign-in: Supabase Auth with email + password, Google and Discord.
- Expansion order: seafaring, knights-and-cities, traders scenarios, explorers.

**Open questions**

- [ ] Exact hex, token and port layout for the first seafaring scenario (enter it from the rulebook with the map editor).

## 15. Notes for Claude Code

This doc is the spec: build milestone by milestone (section 13), and if the code needs to diverge, update this doc's decisions first. Copy the working agreements, commands and conventions below into `CLAUDE.md` at the repo root.

**Working agreements**

- Start each milestone by restating its scope and listing the files to create. Explain the design of any non-obvious piece before writing it.
- Engine work is test-first: write the failing rule test, then the code.
- Keep code plain and readable: small pure functions, explicit types, a `switch` on action type rather than clever generic frameworks or metaprogramming.
- No game rules in `apps/server` or `apps/web`. If the UI needs to know whether a move is legal, it asks the engine.
- No `Math.random` or `Date` in `packages/engine`; an ESLint rule enforces it.
- One branch per milestone, small commits, `pnpm typecheck && pnpm test` green before each commit.
- When a rule is ambiguous, pick the simplest reading, record it in `ASSUMPTIONS.md`, and pin it with a test.

**Commands (root `package.json`)**

| Command | Does |
| --- | --- |
| `pnpm dev` | web + server with hot reload |
| `pnpm test` | Vitest across all packages |
| `pnpm typecheck` / `pnpm lint` | strict TS check / ESLint + Prettier |
| `pnpm sim --games 10000 --seed 1` | bot fuzzing with invariant checks |

**Environment variables**

| Variable | Used by | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | web, server | project URL; server derives the JWKS endpoint to verify tokens |
| `SUPABASE_ANON_KEY` | web | client-side sign-in |
| `SUPABASE_JWT_SECRET` | server | only if the project still uses a shared JWT secret instead of JWKS |
| `DATABASE_URL` | server | Postgres connection string |
| `WEB_ORIGIN` | server | allowed origin for CORS and Socket.IO |
| `PORT` | server | listen port |

**Conventions**

- Action types and decision kinds are `SCREAMING_SNAKE` (`BUILD_ROAD`, `MOVE_ROBBER`).
- Error codes are stable strings the UI maps to messages: `NOT_YOUR_TURN`, `WRONG_DECISION`, `CANNOT_AFFORD`, `ILLEGAL_PLACEMENT`, `PIECE_LIMIT`, `BANK_EMPTY`, `INVALID_TRADE`, `GAME_OVER`, `UNKNOWN_ACTION`. `ERROR_MESSAGES` in the engine holds the UI copy for each.
- Resource keys are lowercase: `wood`, `brick`, `sheep`, `wheat`, `ore`.
- Vertex and edge IDs follow section 4; piece IDs are `${type}-${seat}-${n}`.
- `packages/engine` exports only through `src/index.ts`; other packages never import its internals.

**First session: M0–M1 tasks**

- [x] Scaffold the pnpm workspace (`packages/engine`, `packages/maps`, `packages/protocol`, `apps/server`, `apps/web`, `tools/sim`) with a strict shared `tsconfig`, Vitest and ESLint.
- [x] GitHub Actions workflow: install, typecheck, lint, test.
- [x] Axial hex math: neighbors, corner positions, vertex and edge ID functions.
- [x] `buildGraph(map)` with tests: 19 hexes, 54 vertices, 72 edges on the base map; adjacency sizes correct.
- [x] Map zod schema, validator and `base-4p.json`.
- [x] Seeded PRNG with serializable state; map generator that resolves pools and enforces the red-token constraint, tested over 10k seeds.
- [x] Throwaway SVG page in `apps/web` that renders a generated board, to check the geometry by eye.

**Glossary**

- **Seat / PlayerId:** a position in one game. **User:** an account; the server maps seats to users.
- **Decision:** an entry on the stack saying who must act next and which actions are allowed.
- **Module:** a bundle of rules plugged in through hooks. **Ruleset:** the ordered modules + options for one game.
- **View:** the redacted state a given player or spectator receives.
