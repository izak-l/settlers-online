-- The map a lobby will be played on (spec 011): a copy of its definition, taken when the host
-- picks it. Null means the default base map (lobbies created before this migration).
alter table lobbies add column map jsonb;
