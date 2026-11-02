// Catálogo de juegos de la suite: lo usan la portada /juegos (carrusel,
// tarjetas y franja de imágenes) y "Unirme con un código". Para añadir un
// juego, basta con sumarlo aquí y dejar su captura en public/juegos/capturas/.

export interface GameInfo {
  /** game_type en Supabase (rooms.game_type); null si el juego vive en otra app. */
  slug: string;
  href: string;
  title: string;
  description: string;
  /** Frase corta para el carrusel. */
  tagline: string;
  /** Datos rápidos (jugadores, modo…) para el carrusel. */
  meta: string[];
  /** Captura de pantalla completa de móvil (390×844 a 2×), en public/. */
  screenshot: string;
  emblem: string;
  emblemBg: string;
  emblemColor: string;
  /** Color de fondo del escenario de la tarjeta (CSS). */
  stage: string;
  /** Juego desplegado en otra app/dominio: se abre en una pestaña nueva. */
  external?: boolean;
}

export const GAMES: GameInfo[] = [
  {
    slug: 'domino-3d',
    stage: 'linear-gradient(160deg, #1f6b4a, #0e3b2a)',
    href: 'https://domino-3d.orpira.es/',
    title: 'Dominó 3D',
    description: 'Dominó latino a cuatro en una mesa 3D: contra bots, en el mismo móvil o en salas online.',
    tagline: 'La mesa de siempre, ahora en 3D.',
    meta: ['4 jugadores', 'Contra bots u online'],
    screenshot: '/juegos/capturas/domino-3d.webp',
    emblem: '6|6',
    emblemBg: 'var(--ink)',
    emblemColor: 'var(--paper)',
    external: true,
  },
  {
    slug: 'stop',
    stage: 'linear-gradient(160deg, #c43c3c, #7e1f2b)',
    href: '/juegos/stop',
    title: '¡Stop!',
    description: 'El clásico juego de papel: letra al azar, categorías y puntuación por ronda.',
    tagline: 'Sale una letra. Siete categorías. Gana quien cante ¡Stop! primero.',
    meta: ['En grupo', 'Votación entre amigos'],
    screenshot: '/juegos/capturas/stop.webp',
    emblem: 'A',
    emblemBg: 'var(--ink-blue)',
    emblemColor: 'var(--paper)',
  },
  {
    slug: 'categorias-rapidas',
    stage: 'linear-gradient(160deg, #e8b93b, #b5781a)',
    href: '/juegos/categorias-rapidas',
    title: 'Categorías rápidas',
    description: 'Stop con un banco de 20 categorías que se sortean en cada ronda.',
    tagline: 'Cada ronda, categorías nuevas. Nunca juegas la misma partida.',
    meta: ['En grupo', '20 categorías'],
    screenshot: '/juegos/capturas/categorias-rapidas.webp',
    emblem: '20',
    emblemBg: 'var(--highlight)',
    emblemColor: '#5c4508',
  },
  {
    slug: 'triki',
    stage: 'linear-gradient(160deg, #2b4c7e, #172a4d)',
    href: '/juegos/triki',
    title: 'Triki',
    description: 'El clásico 3 en raya: dos jugadores, por turnos, sin reloj.',
    tagline: 'Tres en raya, cara a cara. ¿Revancha?',
    meta: ['2 jugadores', 'Partidas de un minuto'],
    screenshot: '/juegos/capturas/triki.webp',
    emblem: 'X·O',
    emblemBg: 'var(--stamp-red)',
    emblemColor: 'var(--paper)',
  },
  {
    slug: 'puntos-cajas',
    stage: 'linear-gradient(160deg, #7b5cc4, #3f2b7e)',
    href: '/juegos/puntos-cajas',
    title: 'Puntos y Cajas',
    description: 'Juego de conectar puntos y formar cajas: completas una y juegas de nuevo.',
    tagline: 'Une puntos, cierra cajas y vuelve a tirar.',
    meta: ['De 2 a 4 jugadores', 'Turnos de 20 s'],
    screenshot: '/juegos/capturas/puntos-cajas.webp',
    emblem: '◯▢',
    emblemBg: 'var(--highlight)',
    emblemColor: '#2c3e50',
  },
];

/** Juegos de esta app a los que se puede entrar con un código de sala. */
export const ROOM_GAME_SLUGS = GAMES.filter((g) => !g.external).map((g) => g.slug);
