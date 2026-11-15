-- Accounts are Supabase auth users (or "dev:<name>" in dev mode); the engine only knows seats.
create table profiles (
  id          text primary key,
  username    text,
  created_at  timestamptz not null default now()
);
create unique index profiles_username_lower on profiles (lower(username));

create table lobbies (
  id                text primary key,
  host_id           text not null references profiles (id),
  max_seats         int not null check (max_seats between 2 and 6),
  allow_spectators  boolean not null,
  -- [{ "userId": "...", "ready": true } | null, ...]
  seats             jsonb not null,
  status            text not null check (status in ('open', 'started')),
  game_id           uuid,
  created_at        timestamptz not null default now()
);

-- One row per game. The map is stored inline so a game never depends on a map file changing.
create table games (
  id          uuid primary key,
  lobby_id    text not null references lobbies (id),
  map         jsonb not null,
  modules     text[] not null,
  -- Never sent to clients while the game is running.
  seed        text not null,
  seats       text[] not null,
  status      text not null default 'active' check (status in ('active', 'finished')),
  created_at  timestamptz not null default now(),
  ended_at    timestamptz
);

create table game_players (
  game_id  uuid not null references games (id) on delete cascade,
  seat     text not null,
  user_id  text not null references profiles (id),
  primary key (game_id, seat),
  unique (game_id, user_id)
);

-- The source of truth: replaying these from the seed reproduces the game.
create table actions (
  game_id     uuid not null references games (id) on delete cascade,
  seq         int not null check (seq > 0),
  actor       text not null,
  action      jsonb not null,
  events      jsonb not null,
  created_at  timestamptz not null default now(),
  primary key (game_id, seq)
);

-- A speed cache only; safe to delete.
create table snapshots (
  game_id     uuid not null references games (id) on delete cascade,
  seq         int not null,
  state       jsonb not null,
  created_at  timestamptz not null default now(),
  primary key (game_id, seq)
);
