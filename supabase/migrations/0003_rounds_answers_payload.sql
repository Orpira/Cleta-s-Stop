-- Prepara rounds/answers para juegos futuros: columna jsonb genérica para
-- guardar estado de ronda/respuesta sin añadir columnas por juego.
-- No se usa todavía (Stop sigue usando sus columnas propias: letter,
-- category, word, is_valid, points) — se evalúa migrar de verdad cuando
-- exista un segundo juego que confirme la forma correcta del jsonb.

alter table rounds add column if not exists payload jsonb;
alter table answers add column if not exists payload jsonb;
