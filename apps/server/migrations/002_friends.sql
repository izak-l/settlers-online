-- Friend requests and friendships. One row per pair of users, whichever way the request went.
create table friendships (
  requester_id  text not null references profiles (id) on delete cascade,
  addressee_id  text not null references profiles (id) on delete cascade,
  status        text not null check (status in ('pending', 'accepted')),
  created_at    timestamptz not null default now(),
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
-- At most one row per pair, in either direction.
create unique index friendships_pair on friendships (
  least(requester_id, addressee_id), greatest(requester_id, addressee_id)
);
create index friendships_addressee on friendships (addressee_id);
