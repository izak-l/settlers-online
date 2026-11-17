# 231 — Game flow fixes: settings menu, roll-off, clocks, trades and discards

## Goal

Clear a batch of playtest bugs and small flow changes before scenario 7: an in-game settings menu in place of the top bar, a random first player decided by a logged roll-off, a better timer model (auto-roll, a setup clock, a robber clock, time added for trading, offers that withdraw themselves), clean declines and discards in the log, and two UI bugs (build-mode popups, discard picks resetting).

Feedback: #1, #5, #7, #8, #9, #10, #12, #13, #20, #31.

## Scope / non-scope

**Scope** (each item is its own commit)

1. **In-game settings menu.** In a game (online and sandbox) the top bar is gone. A gear button sits in the top-left corner of the map and opens a small menu: Appearance (Original / Realism), Volume (mute + slider), Exit game (back home; a player's seat is kept, as with closing the tab). Outside games the top bar stays (brand, username, sign out) but no longer shows the appearance or sound controls.
2. **Random first player, logged.** When a game starts, every player rolls two dice; the highest goes first, ties roll again among themselves. The log shows each roll and who goes first. Setup and turns then go clockwise (in seat order) from that player. Seats and colours don't change.
3. **Build mode skips the popup.** After picking Road / Settlement / City (or Ship) in the side panel, clicking a highlighted spot builds straight away. The popup still opens when you click the map with no build mode picked.
4. **Decline once.** A player who has declined an offer can't decline it again (the button greys out; they can still accept if they change their mind). Accepting twice is refused the same way. Fixes the log spam.
5. **Auto-withdraw.** When every other player has declined, the offer is withdrawn automatically after 3 seconds (in every game, timed or not), logged as usual.
6. **Auto-roll.** At the start of each turn the dice roll themselves after 5 seconds unless the player rolls first. In every game, timed or not. The turn timer starts after the roll, so the 5 seconds don't come out of it. Playing a development card before rolling adds 15 seconds to the roll clock; a Knight's robber move then runs on its own robber clock (item 8) while the roll clock pauses.
7. **Setup clock.** In timed games each setup placement (a settlement and its road) gets 90 seconds, whatever the turn timer is. The player who places twice in a row at the turn of the snake gets a fresh 90 seconds for the second one (bug #31). Untimed games: no limit.
8. **Robber clock.** Moving the robber (after a 7 or a Knight) and choosing whom to rob get their own 30-second clock; the turn (or roll) clock pauses meanwhile, as it does for discards. In timed games, and in untimed games when it interrupts the auto-roll (a Knight before rolling).
9. **Time for trading and cards.** In timed games, making an offer and completing a trade each add 10 seconds to the turn clock (at most 60 seconds per turn from trades, so a long back-and-forth can't stretch a turn forever). Playing a development card adds 15 seconds to the clock it's played on: the turn clock, or the roll clock before rolling (in every game).
10. **Discards in the log.** "Ada discarded 2 wood, 2 ore". Discarded cards go back to the bank face up, so this is public information (assumption recorded).
11. **Discard picks stay put.** Your half-picked discard is no longer cleared when someone else finishes discarding (bug #1).

**Non-scope**

- Counter-offers (#14), roll stats (#15), end-of-game results (#4), the other indicators (#16–#19).
- Changing seats or colours based on the roll-off.

## Rules

- **Roll-off:** each player rolls two dice (from the game RNG); highest total goes first; tied players roll again until one is highest. Play then follows seat order starting from that player (p2, p3, p0, p1). Recorded in ASSUMPTIONS.md.
- **Decline / accept:** a player's response to an offer can change from decline to accept or back, but repeating the same response is refused (`INVALID_TRADE`).
- **Discards are public:** the `DISCARDED` event names the cards, visible to everyone.

## Engine changes (test-first)

- **Roll-off:** a new first decision, `ROLL_FOR_ORDER` (action `ROLL_FOR_ORDER`, system actor only), pushed by `createGame` only when the stored map asks for it (`firstPlayer: "roll"`, a new optional `MapInput` field the server sets at start, like `discardLimit`). Its apply rolls, logs `ROLLED_FOR_ORDER` events and a `FIRST_PLAYER` event, then queues the snake setup from the winner and sets `turn.activePlayer`. Games without the field (every stored game, the golden baselines, most tests) start exactly as now.
- **Turn order:** `END_TURN` and setup already go round the seat list; they start from the roll-off winner instead of `players[0]`.
- **Responses:** `RESPOND_TRADE` rejects a repeated response; `legalActions` stops listing it.
- **Clock marks on decisions** (the server reads these; it never looks at decision kinds): `ROLL` → `timer: "roll"`; setup steps → `timer: "setup"` with the round in their data; `MOVE_ROBBER` and `STEAL` → `timer: "robber"`; a `TRADE_OFFER` everyone else has declined → `timer: "expire"`. Discards keep `"short"`.
- **Discard event:** `DISCARDED` text and data list the cards.

## Server changes

- `timers.ts`: clock kinds `turn`, `short` (discard, 30 s), `robber` (30 s), `setup` (90 s per placement round), `roll` (5 s), `expire` (3 s). Roll and expire clocks run in every game; the others only when the lobby has a turn timer. Turn-clock pauses as today for short/robber. Time bonuses: after an `OFFERED_TRADE` or `TRADED` event, add 10 s to the running turn clock, capped at 60 s per turn; after a development card is played, add 15 s to the running roll or turn clock. On expiry the server plays `defaultAction` as `system` (roll, withdraw the offer, random robber hex, etc.), as now.
- At game start the server sets `firstPlayer: "roll"` on the stored map and immediately plays `ROLL_FOR_ORDER` as `system`, so it's in the action log and replays.
- The `clock` sent with `state` gets the new kinds, so the countdown shows the right label.

## UI changes

- `SettingsMenu` (gear, top-left of the board, keyboard and Escape friendly) holding `AppearanceControl`, the sound controls and Exit game; `Shell` hides the top bar on game routes and drops those controls elsewhere.
- Board: with a build mode on, a click on a target sends the build directly.
- Trade view: Decline / Accept enabled from `legal`, so a sent decline greys out.
- Picking: discard picks reset only when a new discard starts (turn + decision depth), not when `pendingFrom` shrinks.
- Countdown labels: "Roll in 5", "Setup", "Robber", "Withdrawing…".
- Sandbox: the roll-off runs at creation; no auto clocks (it has no server).

## Test plan

- Engine: roll-off (ties re-roll, order from winner, log events, replay determinism, games without the field unchanged; golden baselines untouched); repeated responses refused; discard event lists cards; decision timer marks.
- Server: clock unit tests for each kind, bonus and cap, pause/resume; online suite: a game starts with a logged roll-off; auto-roll after 5 s in an untimed game; an all-declined offer withdraws itself; setup gets 90 s and the snake player a fresh clock.
- Web: picking reset rule (pure test); settings menu, build-mode click and decline button checked in the browser at desktop and phone width.
- Fuzz: `pnpm sim` with the roll-off on.

## Open questions

- None. (Decided: auto-roll and auto-withdraw run in every game; +10 s for an offer and for a completed trade, capped at +60 s per turn; +15 s for playing a development card, on the roll clock before rolling; a Knight's robber move gets the robber clock; Exit game leaves to Home and keeps the seat.)

## Status

In progress (on `game-flow`).
