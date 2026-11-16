# 003 — Turn timers

## Goal

Keep games moving when someone wanders off: each turn has a time limit, and when it runs out the server plays safe default moves for that player.

## Scope / non-scope

**Scope**

- Lobby setting: Off, 30, 60, 90 or 120 seconds per turn (default Off). Discards get their own 30-second clock.
- A countdown everyone can see.
- On timeout the server applies the engine's `defaultAction` as the `system` actor, logged and replayed like any other action.

**Non-scope**

- Time banks, chess clocks, per-action timers, kicking idle players.

## Rules

- **Which clock runs** comes from the top decision. Decisions may carry `timer: "short"` (the base game sets it on `DISCARD`); everything else uses the turn clock. The server never looks at decision kinds.
- **Turn clock:** keyed by turn number and the player being waited on (`pendingFrom[0]`). It restarts with the full time when that key changes, and doesn't restart on other actions within the same turn.
- **Short clock:** starts when a short decision reaches the top. While it runs, the turn clock is paused and later resumes with the time it had left.
- **Timeout:** inside the game's action queue, and only if no action has landed since the clock was set, the server repeatedly applies `defaultAction(state, pendingFrom[0])` as `system` until the clock key changes or the game ends (capped at 50 actions as a safety net). For a turn that means: roll if needed, cancel an open offer, finish free roads at random, then end the turn. For a discard: everyone still pending discards at random.
- **Nobody home:** clocks only run while at least one seated player is connected to the game, so an abandoned game doesn't play itself forever. When someone rejoins, the clock starts again from full.
- **Restarts:** clocks live in server memory. After a restart a game's clock starts from full when the room loads.
- During setup the key is the placing player, so a player with two placements in a row (the snake turn) has one clock for both.

## Engine changes

- `Decision.timer?: "short"`. The base module sets it on `DISCARD`. Test: discard decisions are short, nothing else is; existing tests unchanged.

## Server/UI changes

- Migration `002_m6.sql`: `lobbies.turn_seconds int not null default 0`, `games.turn_seconds int not null default 0`.
- Protocol: `lobby:create` takes `turnSeconds` (0, 30, 60, 90, 120); `LobbyState.turnSeconds`; `GameStateMessage.clock?: { kind: "turn" | "short", deadline: number }` (epoch ms).
- `apps/server/src/timers.ts`: pure `clockKey(state)` plus a `TurnClock` per room that arms, pauses and fires. `startServer` takes an optional `secondMs` (default 1000) so tests run timers fast.
- Web: timer choice in the new-game form; a countdown in the action bar (turns urgent under 10 s).

## Test plan

- `timers.test.ts`: `clockKey` for setup, ROLL/MAIN, DISCARD; the pause/resume arithmetic.
- Online suite with `secondMs` tiny: an idle player's turn ends by timeout, the actions are logged with actor `system`, and a restarted server replays to the same state; a pending discard is completed by the short clock; no timeouts fire while every seated player is disconnected.
- Engine: the `timer` field test above.

## Open questions

None.

## Status

In progress
