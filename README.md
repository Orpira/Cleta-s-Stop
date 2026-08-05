# ¡Stop! — orpira.es

Versión online y multijugador del clásico juego de papel "Stop" / "Basta".
Los propios jugadores configuran, antes de empezar la partida: cómo se validan
las palabras, el número máximo de jugadores, la duración de cada ronda y
cuántas rondas se juegan.

## Stack

- **Next.js 14** (App Router) — frontend, desplegado en Vercel
- **Supabase** — Postgres + Realtime (sincroniza salas, jugadores, rondas y
  respuestas en vivo entre todos los participantes) + tabla de leaderboard global
- Sin login: se juega con un nickname; el leaderboard top 5 se guarda por nickname

## 1. Crear el proyecto en Supabase

1. Crea un proyecto nuevo en https://supabase.com
2. Ve a **SQL Editor** y ejecuta el contenido de `supabase/schema.sql`
   (crea las tablas, activa Realtime y las políticas RLS necesarias para el MVP)
3. En **Project Settings → API**, copia:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public key` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 2. Configurar variables de entorno

```bash
cp .env.local.example .env.local
# y pega tus valores de Supabase
```

## 3. Desarrollo local

```bash
npm install
npm run dev
# abre http://localhost:3000
```

Abre dos pestañas (o un modo incógnito) con nicknames distintos para probar
el multijugador en local.

## 4. Desplegar en Vercel

```bash
npm install -g vercel
vercel
```

O conecta el repositorio de GitHub directamente desde el dashboard de Vercel.
En **Project Settings → Environment Variables**, añade las mismas dos
variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).

## 5. Publicarlo bajo tu dominio orpira.es

Recomendado: usar un subdominio, por ejemplo `stop.orpira.es`.

1. En Vercel → tu proyecto → **Settings → Domains**, añade `stop.orpira.es`
2. Vercel te dará un registro CNAME (algo como `cname.vercel-dns.com`)
3. En el panel DNS donde gestionas `orpira.es`, crea:
   - Tipo: `CNAME`
   - Nombre: `stop`
   - Valor: el que indique Vercel
4. Espera a que propague (normalmente minutos) — Vercel emite el
   certificado SSL automáticamente

## Cómo funciona el juego

1. Alguien crea una sala → recibe un código corto (ej. `AB3X9`)
2. El anfitrión configura la partida en el lobby: modo de validación,
   máximo de jugadores, segundos por ronda, número de rondas
3. Comparte el código; el resto se une con su nombre
4. El anfitrión inicia → se sortea una letra → todos escriben a la vez
   contra el cronómetro (Nombre, Apellido, Animal, Fruta, Color, Ciudad, Cosa)
5. Cualquiera puede pulsar **¡Stop!** (o se acaba el tiempo) → se congela la ronda
6. Fase de validación según lo configurado:
   - **Votación**: cada jugador vota si la palabra del resto es válida
   - **Anfitrión decide**: solo el anfitrión valida
   - **Automático**: válida si no está vacía y empieza por la letra correcta
7. Puntuación: 100 pts si es válida y única, 50 si está repetida, 0 si no es válida
8. Se repite por el número de rondas configurado → marcador final →
   se actualiza el **ranking global top 5** (`/ranking`)

## Próximos pasos sugeridos

- Insignias / rachas (gamificación adicional)
- Reconexión automática si un jugador pierde la conexión a mitad de ronda
- Panel de administración de categorías personalizadas por sala
- Reglas RLS más estrictas si el juego se vuelve público (ahora mismo el
  esquema usa políticas abiertas pensadas para un MVP sin login)
