import Link from 'next/link';
import { Sheet } from '../../components/ui/Sheet';

interface Game {
  href: string;
  title: string;
  description: string;
  emblem: string;
  emblemBg: string;
  emblemColor: string;
}

const GAMES: Game[] = [
  {
    href: '/juegos/stop',
    title: '¡Stop!',
    description: 'El clásico juego de papel: letra al azar, categorías y puntuación por ronda.',
    emblem: 'A',
    emblemBg: 'var(--ink-blue)',
    emblemColor: 'var(--paper)',
  },
  {
    href: '/juegos/categorias-rapidas',
    title: 'Categorías rápidas',
    description: 'Stop con un banco de 20 categorías que se sortean en cada ronda.',
    emblem: '20',
    emblemBg: 'var(--highlight)',
    emblemColor: '#5c4508',
  },
  {
    href: '/juegos/triki',
    title: 'Triki',
    description: 'El clásico 3 en raya: dos jugadores, por turnos, sin reloj.',
    emblem: 'X·O',
    emblemBg: 'var(--stamp-red)',
    emblemColor: 'var(--paper)',
  },
];

export default function JuegosPage() {
  return (
    <Sheet brand="orpira.es">
      <h1 className="title" style={{ fontSize: 36 }}>Juegos</h1>
      <p className="subtitle">Elige a qué quieres jugar.</p>

      <div className="game-grid">
        {GAMES.map((game) => (
          <Link key={game.href} href={game.href} className="game-card">
            <div
              className="game-card-emblem"
              style={{ background: game.emblemBg, color: game.emblemColor }}
            >
              {game.emblem}
            </div>
            <h3>{game.title}</h3>
            <p>{game.description}</p>
            <span className="game-card-cta">Jugar →</span>
          </Link>
        ))}
      </div>
    </Sheet>
  );
}
