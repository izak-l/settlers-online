# Settlers Online — Engine & System Design

Nov 15, 2026 · @....

## 1. Goals and constraints

Build a free, self-hosted, browser-based hex-tile trading and building game for a private friend group, using the publicly known base ruleset. The engine must support arbitrary maps and later expansions without a rewrite.

**Goals**

- Real-time online play for 3–4 players (5–6 later) in desktop browsers, with a layout that still works on small screens (down to phone width). No native or mobile app.
- A server-authoritative rules engine that is deterministic and fully tested.
- Maps defined as data: random base boards, fixed layouts and custom maps from an editor.
- Expansion-ready seams (modules, a decision queue, keyed resources) built in from v1. v1 is the base game; expansions follow in order from v1.1 (section 14). Everything is built and played locally first; deploying to free tiers comes last (M9+).
- Accounts from v1: sign-in, friends list, online status, private lobbies and game history. Plus reconnect, save/resume, replays and spectators.

**Non-goals for v1**

- Public matchmaking, ranked play, monetization.
- AI opponents beyond simple random bots for testing.
- Hot-seat or single-device play. Every player joins from their own browser; the only local mode is a developer sandbox.

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
  timer?: "short";              // which turn-timer clock runs while this is on top (M6)
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
- Zones hold `Record<ItemId, number>`; there are no ordered zones. The dev deck is the hidden zone `devdeck` holding counts per card type; buying draws one at random with the game RNG, which has the same odds as a shuffled deck and has no order to leak. A player's cards are in `dev-<p>` (playable; others see a count), `devnew-<p>` (bought this turn; moved into `dev-<p>` at end of turn) and `played-<p>` (public).
- `computeVP(state, player, viewer?)`: hidden VP (VP cards) count only for their owner, or for everyone once the game is over. The public `scores` a client receives are computed for that viewer.
- `viewFor` returns a `PlayerView`: the state minus `rng` and `graph`, with zones redacted (`public`: contents; `count`: contents for the owner, a count for others; `owner`: contents for the owner only; `hidden`: a count only).
- `defaultAction` ends the turn when `END_TURN` is allowed; otherwise it picks a random legal action, reading the RNG without advancing it (so it is deterministic for a state, and the chosen action is logged and replayed like any other).
- A roll of 7 produces nothing. It pushes `MOVE_ROBBER` above `MAIN`, and above that a single `DISCARD` decision listing everyone over 7 cards (`pendingFrom` shrinks as each discards, in any order). Moving the robber pushes `STEAL` only when two or more players can be robbed.

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
- `validate` and `apply` both receive the active modules, so legality checks can use hooks (bank trades use `tradeRatio`).
- `tradeRatio` (lowest across modules wins) gives the bank rate: 4, or 3 / 2 with a building on either end of a matching port edge.
- Modules may provide `defaultAction(state, player)` for decisions they own; the core falls back to a random legal action. The base game rolls, ends the turn, and during a trade offer cancels it (offerer) or declines (everyone else). The core no longer names any base-game action.
- **Player trades:** `OFFER_TRADE` (active player, main step only) pushes a `TRADE_OFFER` decision where everyone is pending: others `RESPOND_TRADE` (accept/decline, changeable), the offerer `CONFIRM_TRADE`s with one accepter (both sides re-checked) or `CANCEL_TRADE`s. No counter-offers in v1.
- Anything the RNG picks from must be in a fixed order (e.g. `cardList` sorts by key). Storage doesn't preserve object key order (Postgres `jsonb` sorts keys), and replay from a snapshot must give the same result as the live game. Pinned by the key-order tests in `game.test.ts`.
- `checkWin(state, modules)` runs in the core after every successful action; the first module to name a winner ends the game (`winner` set, decision stack emptied, a `GAME_WON` event). The base game only lets the player whose turn it is win, counting hidden VP cards, never during setup.
- Awards live in `moduleState.base` (`longestRoad`, `largestArmy`) and are recomputed after any road, settlement or knight. One rule decides both (`awardHolder`): the holder keeps it on a tie; otherwise the unique leader at or above the threshold (5 roads / 3 knights) takes it; tied leaders mean nobody holds it. Longest road is a depth-first search over a player's roads that can end at, but not pass through, an opponent's building.
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
- [x] Roll of 7: every player with 8+ cards discards half, rounded down, simultaneously.
- [x] Robber must move to a different hex; active player steals one random card from a player with a building on it (if any have cards).

**Building**

- [x] Distance rule: no settlement on a vertex adjacent to any other settlement or city.
- [x] Roads connect to your own road or building; settlements (after setup) connect to your own road.
- [x] An opponent's settlement blocks road continuation through that vertex.

**Dev cards**

- [x] Max one dev card played per turn, and not one bought that turn. VP cards are exempt.
- [x] Dev cards may be played before rolling.
- [x] Knight: move robber + steal. Road Building: 2 free roads. Year of Plenty: any 2 from bank. Monopoly: all cards of one resource from every player.

**Trading**

- [x] Players trade only with the active player, during the main step.
- [x] No gifts: both sides must give at least one card.
- [x] Bank 4:1, generic port 3:1, specific port 2:1 for its resource.

**Awards and winning**

- [x] Longest Road: 5+ continuous segments, 2 VP. Ties keep the current holder. If the holder is broken and others tie for longest, nobody holds it.
- [x] Largest Army: 3+ knights played, 2 VP. A challenger must exceed the holder.
- [x] Win at `vpToWin` (10), checked only for the active player during their turn. Hidden VP cards count.

## 8. Networking and hidden information

One Socket.IO connection per signed-in client; every message is a typed, zod-validated JSON envelope defined in `packages/protocol`.

**Messages**

| Direction | Type | Payload |
| --- | --- | --- |
| C→S | `profile:setUsername` | username (3–20 letters, digits, `_`; unique, case-insensitive) |
| C→S | `lobby:create` | seats (3 or 4), allow spectators, turn timer (0, 30, 60, 90, 120 s) |
| C→S | `lobby:join` | lobby id (watch it; doesn't take a seat) |
| C→S | `lobby:seat` | lobby id, seat index or `null` to stand up |
| C→S | `lobby:ready` | lobby id, ready flag |
| C→S | `lobby:start` | lobby id (host only; every seat filled and ready) |
| C→S | `game:join` | game id (your seat if you have one, otherwise spectator if allowed) |
| C→S | `game:action` | game id, `Action` |
| C→S | `lobby:leave` / `game:leave` | stop following a lobby or game (seats are kept) |
| C→S | `lobby:invite` | lobby id, friend's user id |
| C→S | `friends:list` / `friends:request` / `friends:respond` / `friends:remove` | your list / a username / user id + accept / user id |
| C→S | `games:history` | (none): your last 20 games |
| C→S | `chat:send` | game id, text (1–300 characters) |
| S→C | `welcome` | your user id and username (null until picked) |
| S→C | `lobby` | seats (username, ready, connected), status, turn timer, game id once started |
| S→C | `state` | game id, `seq`, `you` (seat or `"spectator"`), filtered `PlayerView`, your `legal` actions, public `scores`, players (username, connected), new `events`; the full `log` only on join; the running `clock` (kind, ms left, total) when the game has a timer |
| S→C | `friends` / `presence` | your whole friends list / one friend's new presence |
| S→C | `invite` / `invite:closed` | a friend's lobby invite / that lobby started |
| S→C | `chat` | new messages, or (on join) the last 100 you may see |

- v1 sends the full filtered view on every change. Board state is small (a few KB), so diffs aren't worth the complexity yet.
- `legalActions` and `computeVP` need the full `GameState`, which clients never get, so the server computes both and sends them with the view. The client highlights moves from `legal` and never works out legality itself.
- Each game processes actions one at a time through a per-game queue, so two clicks can't race.

**As built (M4)**

- Every client→server message is acknowledged: `{ ok: true, ... }` or `{ ok: false, code, message }` with a stable code (engine codes plus `UNAUTHENTICATED`, `BAD_REQUEST`, `NEED_USERNAME`, `USERNAME_TAKEN`, `NOT_FOUND`, `NOT_HOST`, `SEAT_TAKEN`, `LOBBY_STARTED`, `NOT_READY`, `SPECTATORS_DISABLED`, `USER_NOT_FOUND`, `ALREADY_FRIENDS`, `NOT_FRIENDS`, `FRIEND_OFFLINE`, `RATE_LIMITED`, `SERVER_ERROR`). The acknowledgement replaces a separate `rejected` message, and ties each rejection to the request that caused it. Payloads are zod-validated in `packages/protocol`.
- On each action the server: applies it with the engine → writes it (with its events) to `actions` → updates the room → sends each socket in the game its own `state`, built once per role. Nothing is broadcast that a restart would lose.
- `state` carries only that action's new events; the full log comes on `game:join`, so a reconnecting client rebuilds its log from one message.
- Rooms load on demand from the latest snapshot plus later actions, so a restarted server picks games up on the first `game:join`. Clients rejoin automatically after any reconnect.
- **Sign-in:** the browser signs in with Supabase (email + password, Discord) and sends the access token in the Socket.IO handshake. The server verifies it against the project's signing keys (`/auth/v1/.well-known/jwks.json`, issuer `<SUPABASE_URL>/auth/v1`, audience `authenticated`), with a shared-secret fallback for legacy projects. `AUTH_MODE=dev` adds dev sign-in (token `dev:<username>`, stored per tab) for local testing; the server refuses it when `NODE_ENV=production`.
- Lobby ids are short random strings used in invite links (`/#/lobby/<id>`). Seat *i* plays as engine seat `p<i>`. The seed comes from the OS when the host starts and stays on the server.

**Hidden information**

- `viewFor` applies zone visibility: `owner` zones show contents only to their owner; `count` zones show only a number to others; `hidden` zones (deck order) show only a count to everyone.
- Stolen cards: the thief and victim see which resource; others see only that a card moved.
- All RNG runs on the server. The seed is never sent to clients until the game ends.

**Accounts, lobbies, spectators and timers**

- **Auth:** Supabase Auth with email + password (email confirmation and password reset included) and Discord. Google is not set up. The web app signs in with the Supabase client; the game server never handles passwords. On first sign-in the user picks a unique username. Supabase's built-in email sender is rate-limited and meant for testing, so add a custom SMTP provider before inviting many friends.
- The server verifies the Supabase access token (JWT) on the Socket.IO handshake and binds the socket to a `userId`.
- **The engine stays account-agnostic.** It only knows seats (`PlayerId`). The server maps seat → `userId` in `game_players`.
- **Tables:** see section 9. Profiles hold only an id and a unique username (no display names or avatars).
- **Presence:** each socket records where it is (home, a lobby, a game played or watched); a user's presence is the busiest of their sockets. Only accepted friends see it.
- **Lobbies:** private, joined by invite link or a friend invite. The host picks the player count, the turn timer and whether spectators are allowed (map and modules are fixed to the random base board for now).
- **Reconnect:** signing in again reclaims your seat; seats stay reserved while disconnected.
- **Spectators:** get `viewFor("spectator")`, which shows public information only (hand counts, no contents). Spectator chat is a separate channel. Full reveal is available in the replay after the game ends.
- **Turn timer:** configurable per lobby (off, 30, 60, 90 or 120 seconds per turn, plus a 30-second clock for discards). On timeout the server plays `defaultAction` for whoever is being waited on until that clock no longer applies: roll if needed, cancel an open offer, place pending free roads at random, end the turn; a timed-out discard is random.
- Timeout defaults are logged as normal actions from a `system` actor and use the game RNG, so replays stay deterministic.

**As built (M6)**

- **Friends:** a request by username becomes a friendship when accepted; requesting someone who already asked you accepts theirs. One `friendships` row per pair, either direction. `FriendService` holds the rules and serializes changes per pair.
- **Presence** (`PresenceTracker`): the server tells a user's friends whenever their status changes, sending the status as of sending (several updates can be in flight and finish out of order). The UI sends `lobby:leave` / `game:leave` when it navigates away.
- **Invites** go only to online friends, from someone in the open lobby. They live in server memory per lobby and are withdrawn (`invite:closed`) when it starts.
- **Turn timers** (`timers.ts`): the clock key is the turn number plus the waited-on player, or the depth of a `timer: "short"` decision. The turn clock covers the whole turn and pauses while a short clock runs. Clocks live in server memory: they run only while a seated player has the game open, and start from full when someone returns or the server restarts. A timeout runs in the game's queue and does nothing if any action landed since it was armed.
- **Chat:** stored in `chat_messages`. Players post to `players` (everyone reads it), spectators to `spectators` (only spectators read it). 5 messages per 10 seconds per user.

## 9. Persistence, versioning and replay

Postgres stores each game as a header plus an append-only action log; snapshots are only a speed cache.

- `games`: id, lobby id, created/ended, map definition (inline JSON), ruleset (module ids + versions), seed, status.
- `actions`: game id, sequence number (1-based, primary key with the game id), actor (seat or system), action JSON, the events it produced (so the log survives restarts), timestamp.
- `snapshots`: game id, sequence number, state JSON without the derived graph (`toSnapshot` / `fromSnapshot`), written every 25 actions (`SNAPSHOT_EVERY`) and when the game ends.
- When a game ends, `games` also stores `winner_seat` and `final_scores` (full VP, VP cards included) for the history list.
- On server restart, rooms resume by loading the latest snapshot and replaying later actions.
- Also stored: `profiles` (id = auth user id or `dev:<name>`, unique username), `lobbies` (seats as JSON, turn timer), `game_players` (seat ↔ user), `friendships`, `chat_messages`. `games.turn_seconds` is copied from the lobby. Migrations are plain SQL in `apps/server/migrations`, applied in order by `pnpm db:migrate` and on server start (behind an advisory lock).
- The `Store` interface has a Postgres implementation and an in-memory one for tests; the same online test suite runs against both.
- Each module has a `version`. A saved game replays with the module versions it was created with; if a version is no longer available, the game opens read-only from its last snapshot.
- Replay viewer (later): step through the action log with full visibility after the game ends.

## 10. Frontend

React renders the board as one SVG; the client holds only the latest `PlayerView` and uses the shared engine to show legal moves.

- **Board:** hexes as polygons, number tokens, ports on edges. Vertices and edges are invisible hit targets that light up when `legalActions` allows a placement there.
- **Panels:** your hand and dev cards, build buttons with costs, opponents (card counts, VP shown, awards), dice, game log, chat.
- **Trading:** offer builder (give / want), incoming offers with accept/decline, bank and port trades with the best ratio pre-filled.
- **Modals driven by the decision stack:** discard picker, robber placement, steal target, Year of Plenty / Monopoly pickers.
- **State:** Zustand store holds the view and connection status. Optimistic UI is not used; the board updates when the server confirms.
- **Small screens:** responsive layout, not a separate mobile app. The board scales to fit, panels stack below it, tap targets stay comfortably large, and nothing scrolls sideways down to a 375px-wide window.
- **Art:** original flat SVG icons and a custom color palette. No borrowed assets.
- **Cards (M7):** resources and development cards are shown as individual cards, not counts: your hand is a fanned row of cards, and discards, trades and Bounty/Monopoly picks are done by picking cards. Opponents show face-down card backs. Card faces are our own original art.
- **Board size (M7):** the board grows to fill the space it's given at any window size, and players can zoom it (and pan when zoomed). On wide screens the layout uses the extra width instead of a fixed maximum.
- **Sound (M7):** short original sound effects for key moments (dice, building, your turn, trades, robber, win, chat), with a mute toggle and volume remembered per browser. Off-screen tabs don't play sounds for other players' routine moves.
- **Map editor (later):** click hexes to set terrain, tokens and ports; validates with the shared map validator; exports map JSON.

**As built (M3: board UI)**

- Components only see a `GameClient` (`apps/web/src/game/LocalGame.ts`): `snapshot()` → `{ seat, view, legal, scores, log }` and `send(action)`. In M4 a socket client implements it for online play, and the components don't change.
- `LocalGame` implements `GameClient` with the engine running in the tab. It powers the **dev sandbox** (`pnpm dev`, development builds only), where one person acts for whichever seat is being waited on, and the web tests. It is not a player-facing mode; production builds show a placeholder until online play lands.
- The board draws a vertex at the average of its three hex centres and an edge between its two vertices, so positions come straight from the IDs. Views don't carry the graph; the client rebuilds it from `view.map` once.
- Clickable targets are exactly the actions in `legal`. During setup every legal placement lights up; in the main step the Road / Settlement / City buttons pick which kind, and a button is disabled when `legal` has none of that kind. Targets are keyboard-focusable buttons.

**As built (M5: full rules in the UI)**

- Every new decision has its own view, driven by the top decision's `kind` and its `data`: a discard picker (`DISCARD`, amount from `data.amounts`), clickable robber hexes (`MOVE_ROBBER`), victim buttons (`STEAL`), free-road targets (`PLACE_FREE_ROAD`), and the open-offer view (`TRADE_OFFER`) shown to everyone, spectators included.
- One `ResourcePicker` (+/− per resource, optional per-resource and total limits) is reused for discards, Bounty picks and trade offers. Those actions are built in the UI and validated by the server; every other button is enabled only from `legal`.
- The dev cards panel lists your cards (cards bought this turn are marked as playable next turn) with Play buttons from `legal`; Bounty and Monopoly open a chooser. The trade panel appears only on your own main step: bank trades show your rate per resource from `ratios`, and an offer builder sends `OFFER_TRADE`.
- The players panel shows card and dev card counts, knights played, and award badges. A win banner shows the winner and final scores (VP cards revealed).
- **Account and lobby screens:** sign-in (email, Discord), pick a username, create a lobby (3 or 4 seats, spectators on or off), join by invite link, and the lobby's seats and ready flags. Friends, presence and game history land in M6.

**As built (M6: social screens and polish)**

- **Home:** new game (players, turn timer, spectators), join by link, the friends list (add by username, requests, presence with Join / Watch), and "Your games" (last 20: Rejoin, or View a finished game's final board, with winner and scores). Lobby invites from friends appear as toasts on any screen.
- **Lobby:** shows the turn timer and an "Invite friends" list of online friends who aren't seated.
- **Game:** a countdown in the action bar (red under 10 s). Log and chat share one tabbed panel: the log reads oldest-first, auto-scrolls unless you've scrolled up, colours names by seat and marks turn ends; chat shows an unread count. The dev sandbox has no chat.
- **Small screens:** the board's viewBox fits the land plus a strip of sea (ports stay visible). Below 860px the action bar and hand come straight after the board; below 600px every control is at least 44px tall. Board targets have wide invisible hit areas. Checked at 375px: no sideways scrolling on home, lobby or game.
- **Animations:** the dice spin on each roll, new pieces (and city upgrades) pop in, the robber slides, gained resources flash with a "+n". All are off under `prefers-reduced-motion`. They come only from comparing views, never from delaying input.

**As built (M7a: layout, resize and zoom)**

- The game screen fills the window height. The board column takes all the width the side column (`clamp(300px, 24vw, 380px)`) doesn't, with the hand under the board; there is no maximum layout width. Below 860px everything stacks and scrolls with the page: board (aspect from the map, at most 62% of the window height), action bar, hand, then the rest.
- **Zoom and pan** (`board/viewport.ts`, pure and tested; `board/useViewport.ts`): fit (1×) to 4× by the + / − / fit buttons, the mouse wheel around the cursor, or a pinch; drag to pan when zoomed. The viewBox always matches the container's aspect, so the area around the map shows sea, and the fit box (land plus a strip of sea) can never be panned out of view. A press only becomes a drag after 6px, and the click ending a drag is swallowed, so target clicks work at any zoom. At 1× touch drags scroll the page (`touch-action: pan-y`). Zoom resets to fit when the game is opened. No gesture library.
- **Hit areas** are 22 screen px in radius, capped just under half the vertex spacing so neighbours never overlap (at 375px and 1× that cap wins; zooming in gives full-size targets). Keyboard focus on a target outside the zoomed view pans to it.

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

Deployment is M9+: the game is built and played locally through the UI overhaul (M7) and the expansions (M8) first. Deploying is mostly account and hosting setup.

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

Deployment moved to the end (M9+): after the M6 playtest, the priority is making the game feel good (M7) and adding the expansions (M8), developed and played locally. Deploying is mostly setup outside the codebase and can happen whenever it's wanted.

| # | Milestone | Done when |
| --- | --- | --- |
| M0 | Monorepo, CI, lint, test runner | `pnpm test` runs green in CI |
| M1 | Board graph + map loader + base map generator | Graph tests pass; red-token constraint holds over 10k seeds |
| M2 | Engine core: decision stack, module system, setup, roll, produce, build | Scripted setup + 10 turns in a test; resource conservation holds |
| M3 | Board UI against a `GameClient`, with a local dev sandbox | Setup and turns playable in the sandbox minus robber, dev cards, trades |
| M4 | Socket.IO server, accounts, lobbies, spectators, views, reconnect, Postgres log | 4 signed-in players + 1 spectator play 10 turns online, each in their own browser; refresh mid-game recovers the seat |
| M5 | Robber, dev cards, bank/port/player trades, awards, win | Every box in section 7 ticked; fuzzer runs 10k games clean; an online game finishes with a winner |
| M6 | Friends list, presence, invites, game history; polish: log, chat, animations, small-screen layout, turn timers | Friends play a full game online without help; the layout stays usable from desktop down to a 375px-wide window |
| M7 | UI overhaul: individual resource and dev cards instead of counts, better board and piece graphics, a board that resizes to fill the window and can be zoomed, sound effects (section 10) | Hands, discards, trades and card plays all use cards; the board fills the available space from a 375px window to a large desktop; sounds play for key events and can be muted; friends find a full game smooth in a playtest |
| M8 | Map editor, then expansions in order: v1.1 seafaring, v1.2 knights-and-cities, v1.3 traders scenarios, v1.4 explorers (section 14) | See section 14 |
| M9+ | Deploy to free tiers (section 12) | Live on free tiers; survives a server sleep mid-game |

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
- Sign-in: Supabase Auth with email + password and Discord (Google not set up).
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
| `pnpm sim --games 2000 --seed 1` | bot fuzzing with invariant checks |

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
