-- Ranking semanal: cada lunes de madrugada (hora de España) se guarda una
-- copia del ranking de la semana que termina y se vacía la tabla
-- leaderboard, para que todos los juegos empiecen la semana de cero.
--
-- Cómo aplicarla: Supabase → SQL Editor → pegar este archivo → Run.
-- Es idempotente: se puede ejecutar más de una vez sin duplicar nada.
--
-- Limpiar el ranking a mano en cualquier momento (también desde el SQL Editor):
--   select public.reset_weekly_leaderboard();
-- Ver la tarea y sus ejecuciones:
--   select * from cron.job where jobname = 'reset-ranking-semanal';
--   select * from cron.job_run_details order by start_time desc limit 10;
-- Quitar el reinicio automático:
--   select cron.unschedule('reset-ranking-semanal');

-- 1. Supabase Cron (pg_cron)
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- 2. Histórico de rankings semanales (no se lee desde la app: sin políticas
--    RLS, sólo accesible desde el dashboard o con la service role)
create table if not exists leaderboard_weekly_archive (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,          -- lunes de la semana archivada
  nickname text not null,
  game_type text not null,
  best_score int not null,
  games_played int not null,
  last_played_at timestamptz,
  archived_at timestamptz not null default now()
);
create index if not exists idx_leaderboard_archive_week
  on leaderboard_weekly_archive(week_start, game_type, best_score desc);
alter table leaderboard_weekly_archive enable row level security;

-- 3. Archivar y vaciar. security definer: se ejecuta con permisos del dueño
--    (la tabla leaderboard no tiene política de borrado para la app).
create or replace function public.reset_weekly_leaderboard()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  -- lunes (hora de España) de la semana que se cierra
  closing_week date := (date_trunc('week', (now() at time zone 'Europe/Madrid') - interval '1 hour'))::date;
begin
  insert into leaderboard_weekly_archive (week_start, nickname, game_type, best_score, games_played, last_played_at)
  select closing_week, nickname, game_type, best_score, games_played, updated_at
  from leaderboard;

  delete from leaderboard where true;
end;
$$;

-- nadie desde la app (anon / authenticated) puede llamar a la función
revoke all on function public.reset_weekly_leaderboard() from public, anon, authenticated;

-- 4. Tarea programada: domingos a las 23:00 UTC = lunes a las 00:00 en
--    invierno y a la 01:00 en verano (hora de España). Si ya existe una
--    tarea con este nombre, cron.schedule la actualiza.
select cron.schedule(
  'reset-ranking-semanal',
  '0 23 * * 0',
  $$select public.reset_weekly_leaderboard()$$
);
