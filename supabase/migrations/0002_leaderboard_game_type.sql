-- Añade game_type a leaderboard para separar rankings por juego.
-- Aditiva: default 'stop' hace que las filas existentes (todas de Stop) queden bien clasificadas.

alter table leaderboard add column if not exists game_type text not null default 'stop';
create index if not exists idx_leaderboard_game_score on leaderboard(game_type, best_score desc);
