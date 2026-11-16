-- House rules (spec 014): base-game feature switches the host turns on or off, overriding the
-- map's. Empty means the map's own switches. Games carry them inside their stored map.
alter table lobbies add column features jsonb not null default '{}'::jsonb;
