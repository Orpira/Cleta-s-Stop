-- ============================================================
-- Orpira Stop / Basta — esquema de base de datos (Supabase)
-- ============================================================

create extension if not exists "pgcrypto";

-- Salas de juego
create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,                 -- código corto de sala, ej. "AB3X"
  host_id uuid not null,
  status text not null default 'lobby',       -- lobby | playing | round_review | finished
  settings jsonb not null default '{
    "validation_mode": "vote",
    "max_players": 8,
    "round_seconds": 60,
    "categories": ["Nombre","Apellido","Animal","Fruta","Color","Ciudad","Cosa"],
    "rounds_to_play": 5
  }'::jsonb,
  current_round int not null default 0,
  current_letter text,
  created_at timestamptz not null default now()
);

-- Jugadores de una sala
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  nickname text not null,
  is_host boolean not null default false,
  total_score int not null default 0,
  connected boolean not null default true,
  joined_at timestamptz not null default now()
);

-- Rondas jugadas en una sala
create table if not exists rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  round_number int not null,
  letter text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  stopped_by uuid references players(id)
);

-- Respuestas de cada jugador por ronda y categoría
create table if not exists answers (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  category text not null,
  word text not null default '',
  is_valid boolean,                 -- null = pendiente de validar
  points int not null default 0,
  unique (round_id, player_id, category)
);

-- Votos de validación (cuando settings.validation_mode = 'vote')
create table if not exists validation_votes (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null references answers(id) on delete cascade,
  voter_id uuid not null references players(id) on delete cascade,
  valid boolean not null,
  unique (answer_id, voter_id)
);

-- Top 5 histórico global (por nickname, acumulado entre partidas)
create table if not exists leaderboard (
  id uuid primary key default gen_random_uuid(),
  nickname text not null,
  best_score int not null default 0,
  games_played int not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists idx_players_room on players(room_id);
create index if not exists idx_rounds_room on rounds(room_id);
create index if not exists idx_answers_round on answers(round_id);
create index if not exists idx_leaderboard_score on leaderboard(best_score desc);

-- Realtime: habilitar cambios en vivo para estas tablas
alter publication supabase_realtime add table rooms, players, rounds, answers, validation_votes;

-- RLS: MVP abierto (sin login), acceso público de lectura/escritura.
-- Para producción, restringir por room_id conocido y añadir rate limiting.
alter table rooms enable row level security;
alter table players enable row level security;
alter table rounds enable row level security;
alter table answers enable row level security;
alter table validation_votes enable row level security;
alter table leaderboard enable row level security;

create policy "public read rooms" on rooms for select using (true);
create policy "public insert rooms" on rooms for insert with check (true);
create policy "public update rooms" on rooms for update using (true);

create policy "public read players" on players for select using (true);
create policy "public insert players" on players for insert with check (true);
create policy "public update players" on players for update using (true);

create policy "public read rounds" on rounds for select using (true);
create policy "public insert rounds" on rounds for insert with check (true);
create policy "public update rounds" on rounds for update using (true);

create policy "public read answers" on answers for select using (true);
create policy "public insert answers" on answers for insert with check (true);
create policy "public update answers" on answers for update using (true);

create policy "public read votes" on validation_votes for select using (true);
create policy "public insert votes" on validation_votes for insert with check (true);

create policy "public read leaderboard" on leaderboard for select using (true);
create policy "public upsert leaderboard" on leaderboard for insert with check (true);
create policy "public update leaderboard" on leaderboard for update using (true);
