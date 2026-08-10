# Checklist de pruebas manuales

Casos que no cubre `npm run build` (typecheck) ni ninguna suite automatizada
del repo: sincronización en tiempo real entre dos jugadores, políticas RLS de
Supabase, y comportamiento de juego de punta a punta. Cada juego nuevo debería
pasar por su bloque antes de mergear a `main`. Usar dos sesiones de navegador
separadas (o dos perfiles/contextos) para que cada una tenga su propio
`localStorage` — dos pestañas del mismo perfil comparten el jugador guardado.

Marcar cada caso con la fecha y rama en que se verificó. Si un caso deja de
verificarse por un tiempo largo, no asumir que sigue pasando — el código pudo
cambiar debajo.

## Núcleo compartido (rooms / players / leaderboard)

- [x] Un tercer jugador no puede unirse a una sala que ya llegó a
      `max_players` (`room_full`). — *Verificado 2026-08-10, `feature/juego-triki`, con Triki (max_players=2).*
- [x] El ranking (`/ranking?game=<tipo>`) es independiente por `game_type`:
      un jugador que solo jugó `categorias-rapidas` no aparece en el ranking
      de `stop`, y viceversa. — *Verificado 2026-08-10, `feature/juego-triki`.*

## Categorías rápidas

- [x] Las categorías sorteadas cambian de una ronda a la siguiente (no se
      repite el mismo set). — *Verificado 2026-08-10, `feature/juego-triki`.*
- [x] Realtime entre dos sesiones sin recargar: el segundo jugador aparece en
      el lobby del anfitrión al unirse; ambos pasan a "jugando" cuando el
      anfitrión inicia; ambos pasan a "revisión de ronda" al presionar
      "¡Stop!"; ambos ven "fin de partida" al resolver la última ronda. —
      *Verificado 2026-08-10, `feature/juego-triki`.*
- [x] Un jugador vota "Válida" sobre una palabra y después cambia el voto a
      "No válida" (o viceversa) sobre la misma palabra — la segunda escritura
      no debe fallar (401 u otro error) y el valor final persistido debe ser
      el del último voto emitido. — *Verificado 2026-08-10, `feature/juego-triki`:
      `POST validation_votes` → 201 (insert) seguido de `POST` → 200 (upsert),
      valor final `valid: false` confirmado por lectura directa. Sin errores.*

## Triki

- [x] Al iniciar partida con 2 jugadores, el primero en unirse (anfitrión)
      juega con X y el segundo con O.
- [x] Realtime entre dos sesiones sin recargar: unirse, empezar partida,
      cada jugada del tablero, la pantalla de resultado al ganar/empatar, y
      "fin de partida" al terminar. — *Verificado 2026-08-10, `feature/juego-triki`.*
- [x] Una partida ganada se detecta correctamente (línea horizontal probada)
      y resalta la línea ganadora.
- [x] "Revancha" reinicia el tablero a 9 celdas vacías y mantiene el conteo
      de victorias acumuladas.
- [x] Un empate (tablero lleno sin ganador) no suma victoria a ningún
      jugador.
- [x] "Terminar partida" pasa la sala a `finished` y escribe en
      `leaderboard` con `game_type='triki'`, usando victorias acumuladas en
      la sala como puntaje.

## Cómo se corrió la última vez

Verificado con scripts de Playwright ad-hoc (headless, usando el Chrome ya
instalado en el sistema vía `executablePath`, dos `BrowserContext`
independientes por sesión) contra el proyecto de Supabase real apuntado por
`.env`. Los scripts no quedaron en el repo — si hace falta repetir la
verificación, hay que rehacerlos siguiendo esta misma checklist a mano o
pedirlos de nuevo.

**Nota:** estas pruebas escriben datos reales en Supabase (salas, jugadores,
respuestas, filas de `leaderboard`). No hay política `delete` en ninguna
tabla, así que los datos de prueba no se pueden limpiar por API — quedan
hasta que se borren a mano desde el dashboard de Supabase. Usar nombres de
jugador reconocibles como prueba (`TestAna`, `TestBeto`, etc.) para poder
identificarlos después.
