-- In-game chat. Players post to 'players' (everyone reads it); spectators post to
-- 'spectators' (only spectators read it).
create table chat_messages (
  id          bigserial primary key,
  game_id     uuid not null references games (id) on delete cascade,
  channel     text not null check (channel in ('players', 'spectators')),
  user_id     text not null references profiles (id),
  text        text not null,
  created_at  timestamptz not null default now()
);
create index chat_messages_game on chat_messages (game_id, id);
