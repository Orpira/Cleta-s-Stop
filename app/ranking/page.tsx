'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getLeaderboard } from '@/lib/core/scoring';
import { LeaderboardRow } from '@/lib/core/supabaseClient';
import { GAMES } from '@/lib/games/catalog';

const RANKING_SIZE = 5;

/** Juegos con ranking en esta app (el Dominó 3D tiene su propia liga). */
const RANKED = GAMES.filter((g) => !g.external);
const DOMINO = GAMES.find((g) => g.slug === 'domino-3d');

/** Qué mide la puntuación guardada en cada juego. */
const SCORE_LABEL: Record<string, string> = {
  stop: 'Mejor puntuación',
  'categorias-rapidas': 'Mejor puntuación',
  triki: 'Más victorias',
  'puntos-cajas': 'Más cajas',
};

const MEDALS = ['🥇', '🥈', '🥉'];

const dateFormat = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat('es-ES', { dateStyle: 'full', timeStyle: 'short' });

/** "Hoy", "Ayer", "Hace 3 días" durante una semana; después, la fecha. */
function lastPlayedLabel(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000);
  if (days <= 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  if (days < 7) return `Hace ${days} días`;
  return dateFormat.format(date);
}

/**
 * Días que faltan para el reinicio semanal (lunes de madrugada, hora de
 * España; ver supabase/migrations/0005_ranking_semanal.sql). 1 = esta noche.
 */
function daysUntilReset(): number {
  const weekday = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', weekday: 'short' }).format(new Date());
  const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(weekday) + 1; // lunes = 1 … domingo = 7
  return dow > 0 ? 8 - dow : 7;
}

function resetLabel(): string {
  const days = daysUntilReset();
  if (days === 1) return 'Se reinicia esta noche.';
  return `Se reinicia en ${days} días.`;
}

function RankingContent() {
  const searchParams = useSearchParams();
  const requested = searchParams.get('game') || 'stop';
  const game = RANKED.find((g) => g.slug === requested) || RANKED[0];
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [resetText, setResetText] = useState('');

  useEffect(() => {
    setResetText(resetLabel());
  }, []);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setLoadError(false);
    getLeaderboard(game.slug, RANKING_SIZE)
      .then((data) => !cancelled && setRows(data))
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, [game.slug]);

  return (
    <main className="hub ranking">
      <header className="hub-top">
        <Link href="/juegos" className="hub-logo">
          orpira<span>·</span>juegos
        </Link>
        <nav className="hub-nav" aria-label="Secciones">
          <Link href="/juegos">Juegos</Link>
        </nav>
      </header>

      <section className="hub-intro">
        <h1>
          Ranking <em>de la semana</em>
        </h1>
        <p>
          Las {RANKING_SIZE} mejores marcas de cada juego. Empieza de cero cada lunes de madrugada (hora de España).{' '}
          {resetText && <strong className="ranking-reset">{resetText}</strong>}
        </p>
      </section>

      <nav className="ranking-tabs" aria-label="Elegir juego">
        {RANKED.map((g) => {
          const active = g.slug === game.slug;
          return (
            <Link
              key={g.slug}
              href={`/ranking?game=${g.slug}`}
              replace
              scroll={false}
              className={active ? 'ranking-tab is-active' : 'ranking-tab'}
              aria-current={active ? 'page' : undefined}
            >
              <span className="ranking-tab-emblem" style={{ background: g.emblemBg, color: g.emblemColor }} aria-hidden="true">
                {g.emblem}
              </span>
              {g.title}
            </Link>
          );
        })}
      </nav>

      <section className="ranking-card" aria-labelledby="ranking-title" aria-busy={rows === null && !loadError}>
        <div className="ranking-card-head">
          <h2 id="ranking-title">Top {RANKING_SIZE} semanal · {game.title}</h2>
          <Link href={game.href} className="hub-card-cta">
            Jugar →
          </Link>
        </div>

        {loadError ? (
          <p className="ranking-empty">No se pudo cargar el ranking. Prueba a recargar la página.</p>
        ) : rows === null ? (
          <p className="ranking-empty">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="ranking-empty">Esta semana todavía no hay partidas de {game.title}. ¡Estrena el ranking!</p>
        ) : (
          <table className="ranking-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Jugador</th>
                <th scope="col" className="num">{SCORE_LABEL[game.slug] || 'Puntuación'}</th>
                <th scope="col" className="num">Partidas</th>
                <th scope="col">Última partida</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} className={i < 3 ? `podium-${i + 1}` : undefined}>
                  <td className="pos">{MEDALS[i] || i + 1}</td>
                  <td className="name">{r.nickname}</td>
                  <td className="num score">{r.best_score}</td>
                  <td className="num">{r.games_played}</td>
                  <td className="date">
                    {r.updated_at ? (
                      <time dateTime={r.updated_at} title={dateTimeFormat.format(new Date(r.updated_at))}>
                        {lastPlayedLabel(r.updated_at)}
                      </time>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {DOMINO && (
        <p className="ranking-note">
          El {DOMINO.title} tiene su propia liga:{' '}
          <a href={DOMINO.href} target="_blank" rel="noopener noreferrer">
            ver en {DOMINO.title} ↗
          </a>
        </p>
      )}
    </main>
  );
}

export default function RankingPage() {
  return (
    <Suspense fallback={null}>
      <RankingContent />
    </Suspense>
  );
}
