-- Lobbies may have a single seat (solo games, spec 010).
alter table lobbies drop constraint lobbies_max_seats_check;
alter table lobbies add constraint lobbies_max_seats_check check (max_seats between 1 and 6);
