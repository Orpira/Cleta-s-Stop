import { supabase, Player, LeaderboardRow } from './supabaseClient';

/**
 * Suma los puntos ganados en la ronda al total_score de cada jugador.
 * Genérico: cualquier juego que registre `points` por jugador puede reutilizarlo.
 */
export async function applyRoundScores(
  players: Player[],
  scored: { player_id: string; points: number }[]
): Promise<void> {
  for (const p of players) {
    const gained = scored.filter((a) => a.player_id === p.id).reduce((sum, a) => sum + a.points, 0);
    await supabase.from('players').update({ total_score: p.total_score + gained }).eq('id', p.id);
  }
}

/**
 * Ranking de UN juego. Agrupa por nickname (sin distinguir mayúsculas) por si
 * hay filas repetidas de un mismo jugador —Puntos y Cajas las creaba en cada
 * partida—: se queda con la mejor puntuación, suma las partidas y toma la
 * fecha más reciente. En caso de empate a puntos va delante quien tiene más
 * partidas y, después, quien jugó más recientemente.
 */
export async function getLeaderboard(gameType: string, limit: number): Promise<LeaderboardRow[]> {
  const { data } = await supabase
    .from('leaderboard')
    .select('*')
    .eq('game_type', gameType)
    .order('best_score', { ascending: false })
    .limit(500);

  const byPlayer = new Map<string, LeaderboardRow>();
  for (const row of (data as LeaderboardRow[]) || []) {
    const key = row.nickname.trim().toLowerCase();
    const prev = byPlayer.get(key);
    if (!prev) {
      byPlayer.set(key, { ...row });
      continue;
    }
    byPlayer.set(key, {
      ...prev,
      best_score: Math.max(prev.best_score, row.best_score),
      games_played: prev.games_played + row.games_played,
      updated_at: prev.updated_at > row.updated_at ? prev.updated_at : row.updated_at,
    });
  }

  return Array.from(byPlayer.values())
    .sort(
      (a, b) =>
        b.best_score - a.best_score ||
        b.games_played - a.games_played ||
        (b.updated_at || '').localeCompare(a.updated_at || '')
    )
    .slice(0, limit);
}

export async function upsertLeaderboardResult(
  gameType: string,
  nickname: string,
  score: number
): Promise<void> {
  const { data: existing } = await supabase
    .from('leaderboard')
    .select('*')
    .eq('nickname', nickname)
    .eq('game_type', gameType)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('leaderboard')
      .update({
        best_score: Math.max(existing.best_score, score),
        games_played: existing.games_played + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
  } else {
    await supabase
      .from('leaderboard')
      .insert({ nickname, game_type: gameType, best_score: score, games_played: 1 });
  }
}
