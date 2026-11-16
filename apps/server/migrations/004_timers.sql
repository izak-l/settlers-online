-- Turn timer chosen in the lobby (0 = off), copied to the game when it starts.
alter table lobbies add column turn_seconds int not null default 0;
alter table games add column turn_seconds int not null default 0;
