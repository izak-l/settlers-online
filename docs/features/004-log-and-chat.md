# 004 — Game log and chat

## Goal

Make it easy to follow what happened and to talk during a game.

## Scope / non-scope

**Scope**

- Log: oldest at top, newest at the bottom, auto-scrolling unless you've scrolled up; player names in their seat colour; a divider at each turn.
- Chat per game, saved, with two channels: players, and spectators. Spectators read the players' chat; players never see the spectators' chat.

**Non-scope**

- Lobby chat, direct messages, emoji pickers, moderation tools beyond a length cap and rate limit.

## Rules

- A message is 1–300 characters after trimming whitespace.
- At most 5 messages per 10 seconds per user (`RATE_LIMITED`).
- You must have joined the game: players post to `players`, spectators to `spectators`.
- On joining you receive the last 100 messages you may see.

## Engine changes

None (chat is not game state and never goes through the engine).

## Server/UI changes

- Migration `005_chat.sql`: `chat_messages (id bigserial, game_id, channel, user_id, text, created_at)`.
- `Store`: `addChat`, `recentChat(gameId, channels, limit)`.
- Protocol: C→S `chat:send {gameId, text}`; S→C `chat {gameId, messages, replace}` (`replace` on join). New error code `RATE_LIMITED`.
- Web: `Chat.tsx` beside the log; log restyle in `GameLog.tsx`.

## Test plan

- Online suite: a player's message reaches players and spectators; a spectator's reaches only spectators; history on rejoin; length and rate limits; a non-member can't post.

## Open questions

None.

## Status

Shipped
