'use client';

import { ReactNode, useEffect, useState } from 'react';

export interface PodiumPlayer {
  id: string;
  nickname: string;
  total_score: number;
}

interface PodiumProps {
  players: PodiumPlayer[]; // ya ordenados de mayor a menor puntuación
  renderAvatar?: (player: PodiumPlayer) => ReactNode;
}

const MEDALS = ['🥇', '🥈', '🥉'];
const STAND_HEIGHTS = [120, 84, 64]; // px, por puesto (0=1º, 1=2º, 2=3º)
const VISUAL_ORDER = [2, 1, 3]; // orden visual: 1º al centro, 2º izq., 3º der.
const REVEAL_STEP_MS = 500;

// Presentación del podio final: se revela del último puesto visible al
// primero (suspenso creciente), con el 1er puesto destacado en tamaño y
// color propios.
export function Podium({ players, renderAvatar }: PodiumProps) {
  const top = players.slice(0, 3);
  const [revealedCount, setRevealedCount] = useState(0);
  const idsKey = top.map((p) => p.id).join('|');

  useEffect(() => {
    setRevealedCount(0);
    if (top.length === 0) return;
    const timers = top.map((_, i) =>
      setTimeout(() => setRevealedCount((c) => c + 1), (i + 1) * REVEAL_STEP_MS)
    );
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  if (top.length === 0) return null;

  return (
    <div
      className="row"
      style={{
        alignItems: 'flex-end',
        justifyContent: 'center',
        gap: 16,
        marginBottom: 24,
        minHeight: 230,
      }}
    >
      {top.map((player, rank) => (
        <PodiumStep
          key={player.id}
          player={player}
          rank={rank}
          // se revela del último puesto (índice mayor) al primero
          revealed={revealedCount > top.length - 1 - rank}
          avatar={renderAvatar?.(player)}
        />
      ))}
    </div>
  );
}

function PodiumStep({
  player,
  rank,
  revealed,
  avatar,
}: {
  player: PodiumPlayer;
  rank: number;
  revealed: boolean;
  avatar?: ReactNode;
}) {
  const score = useCountUp(player.total_score, revealed);
  const isFirst = rank === 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        order: VISUAL_ORDER[rank],
        flex: '0 1 120px',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          marginBottom: 10,
          opacity: revealed ? 1 : 0,
          transform: revealed ? 'translateY(0) scale(1)' : 'translateY(18px) scale(0.9)',
          transition: 'opacity 400ms ease, transform 400ms cubic-bezier(.34,1.56,.64,1)',
        }}
      >
        <div style={{ fontSize: isFirst ? 38 : 26 }}>{MEDALS[rank]}</div>
        {avatar}
        <strong
          style={{
            fontSize: isFirst ? 20 : 14,
            textAlign: 'center',
            color: isFirst ? '#a5790a' : 'var(--ink)',
            fontFamily: isFirst ? "'Kalam', cursive" : undefined,
          }}
        >
          {player.nickname}
        </strong>
        <span
          style={{
            fontSize: isFirst ? 16 : 13,
            color: isFirst ? '#a5790a' : 'var(--ink-blue)',
            fontWeight: 700,
          }}
        >
          {score} pts
        </span>
      </div>
      <div
        style={{
          width: '100%',
          height: revealed ? STAND_HEIGHTS[rank] : 0,
          background: isFirst ? 'var(--highlight)' : 'var(--ink-blue)',
          borderRadius: '8px 8px 0 0',
          transition: 'height 500ms cubic-bezier(.2,.9,.3,1.3)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          paddingTop: 8,
          color: isFirst ? '#7a5c10' : 'var(--paper)',
          fontWeight: 700,
          fontSize: 20,
          boxShadow: '0 4px 0 rgba(0, 0, 0, 0.15)',
        }}
      >
        {revealed ? rank + 1 : ''}
      </div>
    </div>
  );
}

function useCountUp(target: number, start: boolean, duration = 700): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start) {
      setValue(0);
      return;
    }
    let startTime: number | null = null;
    let raf: number;
    function tick(ts: number) {
      if (startTime === null) startTime = ts;
      const progress = Math.min((ts - startTime) / duration, 1);
      setValue(Math.round(progress * target));
      if (progress < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [start, target, duration]);
  return value;
}
