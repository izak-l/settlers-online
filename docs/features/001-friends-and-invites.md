# 001 — Friends, presence and invites

## Goal

Find your friends without pasting links around: see who's online and what they're doing, invite them into your lobby with one click, and watch their live games.

## Scope / non-scope

**Scope**

- Send a friend request by username; accept or decline incoming requests; remove a friend.
- Live presence for each friend: offline, online, in a lobby, or in a game (playing or watching).
- A Spectate button on a friend who is playing a game.
- From a lobby, invite an online friend. They get a live notification with a Join button.

**Non-scope**

- Invites to offline friends (not stored; share the link instead).
- Blocking, friend suggestions, display names or avatars.

## Rules

- Friendship is mutual: a request becomes a friendship only when the other person accepts.
- Requesting someone who already sent you a request accepts theirs.
- You can't friend yourself, or request someone you're already friends with or already asked (`ALREADY_FRIENDS`).
- Removing a friend, or declining or cancelling a request, deletes the row for both people.
- Presence comes from open sockets. Each socket remembers where it last went (home, a lobby, a game it plays, a game it watches); a user's status is the "busiest" of their sockets: playing > watching > lobby > online.
- Only accepted friends see each other's presence.
- Invites: the inviter must be in an open lobby (seated or watching it); the invitee must be an accepted friend and online. Invites live in server memory only; when the lobby starts, open invites to it are withdrawn.

## Engine changes

None.

## Server/UI changes

- Migration `002_friends.sql`: `friendships (requester_id, addressee_id, status 'pending'|'accepted', created_at)`, with a unique index on the unordered pair and a check that the two differ.
- `Store`: `findProfileByUsername(name)`, `listFriendships(userId)`, `saveFriendship(f)` (replaces the row for the pair), `deleteFriendship(a, b)`. The rules live in `FriendService`; changes to one pair run one at a time.
- `apps/server/src/friends.ts`: friendship rules (request, accept, remove) over the store.
- `apps/server/src/presence.ts`: per-user socket count and per-socket location → status; reports when a user's status changes.
- Protocol, C→S: `friends:list`, `friends:request {username}`, `friends:respond {userId, accept}`, `friends:remove {userId}`, `lobby:invite {lobbyId, userId}`, and `lobby:leave` / `game:leave` so presence follows the UI when you navigate away.
- Protocol, S→C: `friends` (your full list: accepted friends with presence, incoming and outgoing requests), sent on connect and whenever the list changes; `presence {userId, presence}` when one friend moves; `invite {lobbyId, from}` and `invite:closed {lobbyId}`.
- New error codes: `USER_NOT_FOUND`, `ALREADY_FRIENDS`, `NOT_FRIENDS`, `FRIEND_OFFLINE`.
- Web: a Friends panel on Home (add by username, requests, list with presence and Spectate); an Invite list in the lobby; invite toasts on every screen.

## Test plan

- Online suite (memory and Postgres): request → accept → both lists show each other online; crossing requests become a friendship; remove; errors for unknown user, self, duplicate.
- Presence: a friend joining a lobby, then a game, shows `lobby` then `game` with its id; disconnect shows `offline`; non-friends get nothing.
- Invites: only to online friends; the invitee gets `invite`; starting the lobby sends `invite:closed`.

## Open questions

None.

## Status

Shipped
