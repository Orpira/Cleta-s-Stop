'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getLeaderboard } from '../../lib/core/scoring';
import { LeaderboardRow } from '../../lib/core/supabaseClient';
import { Sheet } from '../../components/ui/Sheet';
import { ScoreTable } from '../../components/ui/ScoreTable';

function RankingContent() {
  const searchParams = useSearchParams();
  const gameType = searchParams.get('game') || 'stop';
  const [rows, setRows] = useState<LeaderboardRow[]>([]);

  useEffect(() => {
    (async () => {
      const data = await getLeaderboard(gameType, 5);
      setRows(data);
    })();
  }, [gameType]);

  return (
    <Sheet brand="orpira.es">
      <h1 className="title" style={{ fontSize: 36 }}>Top 5</h1>
      <p className="subtitle">Las mejores puntuaciones históricas de ¡Stop!</p>

      <ScoreTable
        headers={['#', 'Jugador', 'Mejor puntuación', 'Partidas']}
        rows={rows.map((r, i) => ({
          key: r.id,
          cells: [i + 1, r.nickname, r.best_score, r.games_played],
        }))}
        emptyMessage="Todavía no hay partidas registradas."
      />

      <p style={{ marginTop: 20 }}>
        <a href="/juegos/stop" style={{ color: 'var(--ink-blue)' }}>← Volver a jugar</a>
      </p>
    </Sheet>
  );
}

export default function RankingPage() {
  return (
    <Suspense fallback={null}>
      <RankingContent />
    </Suspense>
  );
}
