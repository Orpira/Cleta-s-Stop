-- Añade game_type a rooms para soportar varios juegos en la misma tabla.
-- Aditiva: default 'stop' para no romper salas ya creadas.

alter table rooms add column if not exists game_type text not null default 'stop';
create index if not exists idx_rooms_game_type on rooms(game_type);
