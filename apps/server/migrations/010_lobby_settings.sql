-- Lobby settings (spec 229): points to win and the discard limit. Null for lobbies created
-- before them; the server uses the lobby's map's values.
alter table lobbies add column vp_to_win integer;
alter table lobbies add column discard_limit integer;
