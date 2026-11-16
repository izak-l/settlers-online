# 002 — Game history

## Goal

See your games in one place: rejoin one in progress, or look back at who won a finished one.

## Scope / non-scope

**Scope**

- A "Your games" list on Home, newest first (last 20): status, start date, players (you marked), and for finished games the winner and final scores.
- Rejoin a game in progress; open a finished game to see its final board, read-only.

**Non-scope**

- Step-by-step replay viewer (DESIGN §9, later).
- Stats, ratings, search.

## Rules

- Final scores are the full VP totals (VP cards included) when the game ended, computed by the server with `computeVP` at the winning action and stored with the game.
- Anyone who sat in the game can open it; finished games are otherwise spectatable on the same terms as live ones.

## Engine changes

None.

## Server/UI changes

- Migration `003_history.sql`: `games.winner_seat text`, `games.final_scores jsonb`.
- `Store.finishGame` also takes the winner and final scores; new `Store.gamesForUser(userId, limit)` returns game summaries with player usernames.
- Protocol: C→S `games:history` → `{ games: GameSummary[] }`.
- Web: `GameHistory.tsx` on Home.

## Test plan

- Online suite: after a game is played to a win, `games:history` for a player lists it as finished with the winner and scores; an unfinished game is listed as active; another user's games aren't listed.

## Open questions

None.

## Status

Shipped
