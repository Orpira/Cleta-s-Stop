-- Triki (3 en raya) no usa letra por ronda; rounds.letter era NOT NULL
-- porque solo existían juegos de escritura hasta ahora. Se relaja para
-- permitir rounds sin letra sin recurrir a un valor sentinela como ''.

alter table rounds alter column letter drop not null;
