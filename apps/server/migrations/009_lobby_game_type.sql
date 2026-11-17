-- The lobby's game type (spec 023): "base", "seafaring-3" or "seafaring-4". Null for lobbies
-- created before game types existed; the server works it out from the lobby's map.
alter table lobbies add column game_type text;
