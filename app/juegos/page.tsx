import type { Metadata } from 'next';
import Link from 'next/link';
import { GAMES } from '@/lib/games/catalog';
import { HeroCarousel } from '@/components/juegos/HeroCarousel';
import { JoinByCode } from '@/components/juegos/JoinByCode';
import { GameLink } from '@/components/juegos/GameLink';
import { Phone } from '@/components/juegos/Phone';

export const metadata: Metadata = {
  title: 'Juegos — orpira.es',
  description:
    'Juega con tus amigos sin instalar nada: Dominó 3D, ¡Stop!, Categorías rápidas, Triki y Puntos y Cajas. Crea una sala y comparte el enlace.',
};

const STEPS = [
  { title: 'Elige un juego', detail: 'Crea una sala en un toque. Sin registro ni descargas.' },
  { title: 'Comparte el enlace', detail: 'O dicta el código de 5 letras a quien quieras.' },
  { title: 'Jugad a la vez', detail: 'Cada uno desde su móvil, en tiempo real.' },
];

export default function JuegosPage() {
  // la franja se duplica para que el desplazamiento sea continuo
  const marquee = [...GAMES, ...GAMES];

  return (
    <main className="hub">
      <header className="hub-top">
        <Link href="/juegos" className="hub-logo">
          orpira<span>·</span>juegos
        </Link>
        <nav className="hub-nav" aria-label="Secciones">
          <a href="#juegos">Juegos</a>
          <Link href="/ranking">🏆 Ranking</Link>
        </nav>
      </header>

      <section className="hub-intro">
        <h1>
          Tu noche de juegos, <em>sin instalar nada.</em>
        </h1>
        <p>Crea una sala, comparte el enlace y en segundos estáis jugando. Desde el móvil, el portátil o la tele.</p>
      </section>

      <HeroCarousel games={GAMES} />

      <section className="hub-join" aria-label="Unirse a una partida">
        <JoinByCode />
        <ol className="hub-steps">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <span className="hub-step-n" aria-hidden="true">{i + 1}</span>
              <div>
                <strong>{s.title}</strong>
                <span>{s.detail}</span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div className="hub-marquee" aria-hidden="true">
        <div className="hub-marquee-track">
          {marquee.map((g, i) => (
            <figure key={`${g.slug}-${i}`} className="hub-marquee-item">
              <Phone src={g.screenshot} sizes="150px" />
              <figcaption>{g.title}</figcaption>
            </figure>
          ))}
        </div>
      </div>

      <section id="juegos" className="hub-section" aria-labelledby="juegos-title">
        <h2 id="juegos-title" className="hub-section-title">Elige a qué jugar</h2>
        <div className="hub-grid">
          {GAMES.map((game) => (
            <GameLink key={game.slug} game={game} className="hub-card">
              <span className="hub-card-stage" style={{ ['--stage' as string]: game.stage }} aria-hidden="true">
                <Phone src={game.screenshot} sizes="120px" />
              </span>
              <span className="hub-card-body">
                <span className="hub-card-head">
                  <span className="hub-card-emblem" style={{ background: game.emblemBg, color: game.emblemColor }}>
                    {game.emblem}
                  </span>
                  <span className="hub-card-title">{game.title}</span>
                </span>
                <span className="hub-card-desc">{game.description}</span>
                <span className="hub-card-foot">
                  <span className="hub-card-meta">{game.meta.join(' · ')}</span>
                  <span className="hub-card-cta">Jugar {game.external ? '↗' : '→'}</span>
                </span>
              </span>
            </GameLink>
          ))}
        </div>
      </section>

      <footer className="hub-footer">
        Hecho con cariño por <a href="https://orpira.es">orpira.es</a>
      </footer>
    </main>
  );
}
