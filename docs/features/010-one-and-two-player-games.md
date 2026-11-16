# 010 — One- and two-player games

## Goal

A lobby can be created for 1, 2, 3 or 4 players, so a game can start with just one or two people (practising alone, or a game for two).

## Scope / non-scope

**Scope**

- Lobbies and the dev sandbox offer 1, 2, 3 or 4 seats.
- The same base rules at every player count, on the same random base board.

**Non-scope**

- The published two-player variant rules (extra trade actions, a neutral player) and any bots. They can come later as a rules module.
- 5–6 players.

## Rules

- Every rule is unchanged at 1 or 2 players: setup is still a snake (with one player, they place both settlements and roads in a row), the robber still moves on a 7, and the win is still at 10 VP.
- **Offers need someone to trade with.** `OFFER_TRADE` is rejected (`INVALID_TRADE`) when there are no other players, so a solo game never shows an offer nobody can answer. Bank and port trades work as usual.
- With nobody to rob, the robber moves and nothing is stolen (already the case when nobody can be robbed).

## Engine changes

- `OFFER_TRADE` validation: at least one other player. Test-first in `players.test.ts`, recorded in `ASSUMPTIONS.md` (A25).
- Tests: a scripted solo game (setup with two placements in a row, a roll, a 7 with no steal) and a two-player setup, with the usual invariants.

## Server/UI changes

- `packages/protocol`: `maxSeats` accepts 1–4 (and its test).
- `packages/maps/maps/base-4p.json`: `players.min` becomes 1, so the data stays true.
- `apps/web`: the Home "new game" picker and the dev sandbox offer 1–4 seats. Everything else (lobby seats, ready, start, turn timers, spectators, history) already works for any seat count. With one player the trade panel shows only "With the bank".
- `apps/server/migrations/006_solo_lobbies.sql`: `lobbies.max_seats` allows 1–6 (it was 2–6).
- `tools/sim`: run the fuzzer with `--seats 1` and `--seats 2` as well; the bot only builds an offer when `legal` lists one.

## Test plan

- Engine: the solo and two-player tests above; the offer rule.
- Protocol: 1–4 accepted, 0 and 5 rejected.
- Server: the existing online suite with a one-seat lobby (create, ready, start, play a turn).
- `pnpm sim --games 500 --seed 1 --seats 1` and `--seats 2` run clean.
- Manual: start a 1-player and a 2-player game online, play to a few turns.

## Open questions

None. (Decided: solo games appear in game history like any other game.)

## Status

Shipped
