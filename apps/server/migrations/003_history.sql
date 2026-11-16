-- Game history: who won and the final scores (VP cards included), stored when the game ends.
alter table games add column winner_seat text;
alter table games add column final_scores jsonb;
create index game_players_user on game_players (user_id);
