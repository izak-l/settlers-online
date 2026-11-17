# Settlers Online

A free, self-hosted, browser-based hex-tile trading and building game that a private group of friends play online, each in their own browser. There is no hot-seat or single-device mode. It uses the publicly known base ruleset, and expansions are added as rules modules.

**The spec is `docs/DESIGN.md`.** Read it before starting any milestone. To change scope or diverge from it, follow the Docs workflow below. Never let the code and the docs silently disagree.

## Current focus

Everything so far is merged into local `main` (not pushed or deployed): the client work
(specs 223–226: immersive board, map build popups, floating trade trays, artwork selector) and
M10 up to spec 019 (switches, seafaring core, scenarios 1–6). Next is M10 spec 020 on a new
`m10` branch cut from `main`. Client specs are numbered from 223 so expansion specs keep 0xx.
Keep the untracked `assets/audio/` out of commits.

Work milestone by milestone (DESIGN.md §13). Don't start the next milestone until the current one's "Done when" criteria pass.

- [x] M0 Monorepo, CI, lint, test runner
- [x] M1 Board graph, map loader, base map generator
- [x] M2 Engine core: decision stack, module system, setup, roll, produce, build
- [x] M3 Board UI against a `GameClient`, with a local dev sandbox
- [x] M4 Socket.IO server, Supabase auth, lobbies, spectators, reconnect, Postgres log
- [x] M5 Robber, dev cards, trades, awards, win
- [x] M6 Friends, presence, invites, history, polish, turn timers (specs 001–005 in docs/features/)
- [x] 1–4 player games (docs/features/010-one-and-two-player-games.md)
- [x] M7 UI overhaul: cards instead of counts, original art, a resizable/zoomable board, sounds (specs 006–009)
- [x] M9 Deploy: Cloudflare Pages + Oracle ARM VM (docs/features/012-deploy.md; runbook docs/DEPLOY.md)
- [x] M8a Map selector: JSON maps in the repo, chosen in the lobby (docs/features/011-map-catalog.md; drafts in packages/maps/maps/drafts/)
- [ ] M10 Base-game feature switches, then seafaring ← now (specs 014 switches, 015 seafaring + scenarios, 016 fog, 017 variable setup; 018–022 written before each later scenario; decision 0001). Rules follow the 2025 seafaring rulebook. Done: M10a switches (014), M10b seams, M10c seafaring core + scenarios 1, 2, 4 (fixed maps). M10d variable setup (017), M10e fog + scenario 3 (016), M10f scenario 5 Lost Settlers (018), M10g scenario 6 Weavers' Isles (019). Merged into `main` through spec 019. Next: specs 020–022 (scenarios 7–8, new world) and 023 (game modes: pick mode, then map), approved; build them in order (020 next)
- [ ] M11 Knights-and-cities
- [ ] M12 Traders scenarios
- [ ] M13 Explorers
- [ ] M8b Map editor: a Maps tab to draw, save and pick your own maps (deferred until the expansions exist, so it covers their terrain, pieces and scenario rules; spec 013 written then)

Tick these off as milestones finish. Online play (M4) deliberately came before the remaining rules (M5); deployment (M9) shipped before M8 and the expansions so friends can play the hosted game; the map editor (M8b) waits until after the expansions; see DESIGN.md §13. Playtest feedback is tracked in docs/FEEDBACK.md.

## Repo layout

```
packages/engine     pure rules engine: board graph, state, actions, modules, views (no runtime deps)
packages/maps       map JSON definitions, zod schemas, validator, generators
packages/protocol   client<->server message types + zod validation
apps/server         Node + Socket.IO: lobbies, auth checks, presence, persistence, view filtering
apps/web            React + Vite + Zustand, SVG board; talks to the game only through `GameClient`
tools/sim           seeded bot games for fuzz testing
docs/DESIGN.md      the system as it exists now + near-term roadmap
docs/features/      one short spec per feature (NNN-name.md)
docs/decisions/     decision records for architecture changes (NNNN-title.md)
docs/FEEDBACK.md    numbered playtest feedback backlog (numbers are permanent)
ASSUMPTIONS.md      every ambiguous rule reading we chose, with the test that pins it
```

## Docs workflow

There is one CLAUDE.md and one DESIGN.md, always updated in place. Never create versioned copies (DESIGN-v2, CLAUDE-new); git is the history.

- **CLAUDE.md:** how to work in this repo. Change "Current focus" as work moves. Add a rule only when the same mistake keeps happening.
- **docs/DESIGN.md:** describes the system as built, not a contract. Keep it true.
- **docs/features/NNN-name.md:** write one before starting any new feature or scope change. Sections: Goal, Scope / non-scope, Rules, Engine changes, Server/UI changes, Test plan, Open questions, Status (Draft → In progress → Shipped).
- **docs/decisions/NNNN-title.md:** write one only when a change breaks or replaces an architecture rule below. Sections: Context, Decision, Consequences, Status. Never edit an accepted record; supersede it with a new one.

**Loop for new work:**
1. Draft the feature spec and get it reviewed before coding.
2. If it breaks an architecture rule, write a decision record and update the affected DESIGN.md section first.
3. Point "Current focus" at the spec.
4. Build it.
5. When it ships, fold the lasting parts into DESIGN.md and mark the spec Shipped.

**Definition of done (every milestone and feature):** tests and typecheck green, DESIGN.md matches the code, "Current focus" updated, the feature spec's Status set, and any new assumptions recorded in ASSUMPTIONS.md. Work isn't done until the docs are.

## Commands

```
pnpm install
pnpm dev                          # web + server with hot reload (web alone opens the dev sandbox)
pnpm test                         # Vitest, all packages
pnpm typecheck                    # strict tsc, all packages
pnpm lint                         # ESLint + Prettier
pnpm sim --games 2000 --seed 1   # bot fuzzing with invariant checks
pnpm --filter @settlers/server db:migrate   # apply SQL migrations to DATABASE_URL
pnpm --filter @settlers/server build        # bundle the server to apps/server/dist/server.mjs
scripts/deploy-server.sh ubuntu@<vm-ip>     # build, ship and restart the server (docs/DEPLOY.md)
SERVER_URL=https://<api> scripts/deploy-web.sh   # build and upload the web app to Cloudflare Pages
```

Run `pnpm typecheck && pnpm test` before every commit.

## Architecture rules (non-negotiable)

1. **The server is authoritative.** Clients send intents. The server validates them with the engine, appends them to the action log, then broadcasts a filtered view to each player.
2. **The engine is pure.** `packages/engine` does no I/O and never uses `Math.random`, `Date`, timers or globals. Randomness comes from the seeded PRNG whose state lives in `GameState.rng`. Same seed + same actions = same game. ESLint enforces this.
3. **No game rules outside the engine.** `apps/server` and `apps/web` never decide legality. They call `legalActions` / `apply`.
4. **Every rule lives in a module, and the base game is a module too.** No `if (expansion)` checks in the core. If a module needs a new seam, add the hook, then add a base-module test proving nothing changed.
5. **Flow comes from the decision stack, not phase enums.** Every action is checked against the top decision first, then against the owning module.
6. **VP is always computed** from `vpSources`, never stored as a counter.
7. **Resources, pieces and cards are keyed data.** Hands are `Record<ResourceId, number>`, never fixed fields. Cards live in zones with a visibility setting.
8. **Hidden information is filtered in exactly one place: `viewFor`.** Never send raw `GameState` to a client.
9. **The engine knows seats, not users.** Account identity stays in the server (`game_players`).
10. **Every server-forced move (timeouts) is a normal action** from the `system` actor, logged and replayable.

## Engine API

```ts
createGame(map, ruleset, seats, seed): GameState
apply(state, actor, action): { ok: true, state, events } | { ok: false, code, message }
legalActions(state, playerId): ActionSpec[]
viewFor(state, viewer | "spectator"): PlayerView
defaultAction(state, playerId): Action   // timeout fallback
```

`apply` never mutates its input.

## Conventions

- TypeScript `strict`, no `any` without a comment explaining why.
- Action types and decision kinds: `SCREAMING_SNAKE` (`BUILD_ROAD`, `MOVE_ROBBER`).
- Error codes are stable strings: `NOT_YOUR_TURN`, `WRONG_DECISION`, `CANNOT_AFFORD`, `ILLEGAL_PLACEMENT`, `PIECE_LIMIT`, `BANK_EMPTY`, `INVALID_TRADE`. Add new ones to the shared enum and give the UI a message for each.
- Resource keys are lowercase: `wood`, `brick`, `sheep`, `wheat`, `ore`.
- Hex coordinates are axial `(q, r)`, pointy-top. A vertex ID is its 3 touching hex coords, sorted and joined with `|`. An edge ID is its 2 touching hex coords, sorted.
- Piece IDs: `${type}-${seat}-${n}`.
- Other packages import the engine only through `packages/engine/src/index.ts`.
- Prefer small pure functions and a `switch` on action type over clever generic frameworks or metaprogramming. Code should be readable by someone learning the system.

## How to work

- **Start each milestone** by restating its scope, listing the files you'll create or change, and explaining the design of anything non-obvious. Wait for confirmation before writing large amounts of code.
- **Engine work is test-first:** write the failing rule test, then the code. Use small hand-built fixture maps and scripted action lists.
- **Ambiguous rule?** Pick the simplest reading, record it in `ASSUMPTIONS.md`, and pin it with a test. Don't guess silently.
- **A fuzz failure** (`tools/sim`) becomes a permanent regression test using that seed.
- Keep commits small, with one milestone per branch (`mN`, cut from `main`). Don't refactor unrelated code in the same change.
- **When a milestone is done** (its "Done when" passes and the definition of done above is met), say so and ask before merging its branch into `main`. Never merge or push without the user's go-ahead.
- When you finish a task, say what changed, what's tested, and what's left. Keep it short.

## Testing invariants (assert after every action in sim and integration tests)

- Total of each resource across bank + hands is constant (19 in base).
- No negative counts; piece limits respected.
- Computed VP matches the pieces and cards.
- The decision stack is never empty before the game ends.
- Replaying the log from the seed reproduces the final state exactly.
- `viewFor` never leaks another player's hand, dev cards or deck order.

## Environment

```
SUPABASE_URL          web, server   project URL; server verifies tokens via the project's JWKS endpoint
SUPABASE_ANON_KEY     web           the project's publishable key (email + password, Discord sign-in)
SUPABASE_JWT_SECRET   server        only if the project still uses a shared JWT secret
DATABASE_URL          server        Postgres (in-memory store if unset: games lost on restart)
WEB_ORIGIN            server        allowed browser origins for CORS / Socket.IO, comma-separated
PORT                  server, web   server listen port; web connects to localhost:PORT unless SERVER_URL is set
SERVER_URL            web           game server URL for builds that don't run next to it
AUTH_MODE             server, web   "dev" adds per-tab dev sign-in; refused when NODE_ENV=production
TEST_DATABASE_URL     tests         Postgres for the server test suite (skipped if unset)
MIGRATIONS_DIR        server        where the SQL migrations are (set in the Docker image)
API_DOMAIN            deploy        the server's public HTTPS name (VM ~/settlers/.env only)
POSTGRES_PASSWORD     deploy        password for the VM's Postgres container (VM ~/settlers/.env only)
```

Both apps read the repo-root `.env`, then `.env.local` (gitignored), which wins. Local dev keeps `DATABASE_URL`, `TEST_DATABASE_URL` and `AUTH_MODE=dev` in `.env.local` so nothing touches the hosted database. The web build only ever receives `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SERVER_URL` and the dev-auth flag (see `apps/web/vite.config.ts`); never widen that.

Never commit `.env` files or keys. Keep `.env.example` and `deploy/env.example` up to date. Production settings live only in `~/settlers/.env` on the VM.

## IP rules

Never use the trademarked game name, logos, official art, card text or scenario names/text anywhere in code, UI copy or assets. Generic terms (settlement, city, road, robber, knight, ship) are fine. Module IDs like `seafaring` are internal only; UI display names are our own. All art is original.
