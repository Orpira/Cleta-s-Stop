'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

interface LeaderboardRow {
  id: string;
  nickname: string;
  best_score: number;
  games_played: number;
}

export default function RankingPage() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('leaderboard')
        .select('*')
        .order('best_score', { ascending: false })
        .limit(5);
      setRows((data as LeaderboardRow[]) || []);
    })();
  }, []);

  return (
    <div className="page">
      <div className="sheet">
        <div className="brand">orpira.es</div>
        <h1 className="title" style={{ fontSize: 36 }}>Top 5</h1>
        <p className="subtitle">Las mejores puntuaciones históricas de ¡Stop!</p>

        <table className="scores">
          <thead>
            <tr>
              <th>#</th>
              <th>Jugador</th>
              <th>Mejor puntuación</th>
              <th>Partidas</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td>{i + 1}</td>
                <td>{r.nickname}</td>
                <td>{r.best_score}</td>
                <td>{r.games_played}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4}>Todavía no hay partidas registradas.</td>
              </tr>
            )}
          </tbody>
        </table>

        <p style={{ marginTop: 20 }}>
          <a href="/" style={{ color: 'var(--ink-blue)' }}>← Volver a jugar</a>
        </p>
      </div>
    </div>
  );
}
