'use client';

import Image from 'next/image';
import { KeyboardEvent, TouchEvent, useCallback, useEffect, useRef, useState } from 'react';
import { GameInfo } from '@/lib/games/catalog';
import { GameLink } from './GameLink';
import { Phone } from './Phone';

const INTERVAL_MS = 6000;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}

/**
 * Banner principal: pasa por los juegos con su captura de fondo, una frase y
 * un botón para jugar. Avanza solo cada 6 s (se pausa al pasar el ratón, al
 * enfocar con el teclado o si el sistema pide reducir movimiento), y se puede
 * mover con flechas, puntos, teclado o deslizando en el móvil.
 */
export function HeroCarousel({ games }: { games: GameInfo[] }) {
  const n = games.length;
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const reduced = usePrefersReducedMotion();
  const touchStartX = useRef<number | null>(null);
  const paused = hovered || focused || reduced;

  const go = useCallback((i: number) => setIndex(((i % n) + n) % n), [n]);

  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => go(index + 1), INTERVAL_MS);
    return () => clearTimeout(t);
  }, [index, paused, go]);

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowRight') go(index + 1);
    if (e.key === 'ArrowLeft') go(index - 1);
  }

  function onTouchStart(e: TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function onTouchEnd(e: TouchEvent) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
    touchStartX.current = null;
  }

  return (
    <section
      className="hero"
      aria-roledescription="carrusel"
      aria-label="Juegos destacados"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(false);
      }}
      onKeyDown={onKeyDown}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {games.map((game, i) => {
        const active = i === index;
        return (
          <div
            key={game.slug}
            className={active ? 'hero-slide is-active' : 'hero-slide'}
            role="group"
            aria-roledescription="diapositiva"
            aria-label={`${i + 1} de ${n}: ${game.title}`}
            aria-hidden={!active}
          >
            <div className="hero-backdrop" aria-hidden="true">
              <Image src={game.screenshot} alt="" fill sizes="400px" />
            </div>
            <div className="hero-shade" />
            <div className="hero-device" aria-hidden="true">
              <Phone src={game.screenshot} sizes="(max-width: 860px) 160px, 260px" priority={i === 0} />
            </div>
            <div className="hero-content">
              <span className="hero-kicker">{game.external ? 'También en la suite' : 'Juega con tus amigos'}</span>
              <h2 className="hero-title">{game.title}</h2>
              <p className="hero-tagline">{game.tagline}</p>
              <ul className="hero-meta">
                {game.meta.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
              <GameLink game={game} className="btn btn-stop hero-cta" tabIndex={active ? 0 : -1}>
                Jugar a {game.title} {game.external ? '↗' : '→'}
              </GameLink>
            </div>
          </div>
        );
      })}

      <div className="hero-controls">
        <button type="button" className="hero-arrow" onClick={() => go(index - 1)} aria-label="Juego anterior">
          ‹
        </button>
        <div className="hero-dots" role="tablist" aria-label="Elegir juego">
          {games.map((game, i) => (
            <button
              key={game.slug}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={game.title}
              className={i === index ? 'hero-dot is-active' : 'hero-dot'}
              onClick={() => go(i)}
            >
              {i === index && (
                <span
                  key={index}
                  className="hero-dot-progress"
                  style={{ animationDuration: `${INTERVAL_MS}ms`, animationPlayState: paused ? 'paused' : 'running' }}
                />
              )}
            </button>
          ))}
        </div>
        <button type="button" className="hero-arrow" onClick={() => go(index + 1)} aria-label="Juego siguiente">
          ›
        </button>
      </div>
    </section>
  );
}
