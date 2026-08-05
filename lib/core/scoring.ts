import { supabase, Player, LeaderboardRow } from './supabaseClient';

/**
 * eligibleVoters = jugadores que SÍ pueden votar esta respuesta, es decir,
 * el total de jugadores de la sala MENOS el propio autor de la palabra
 * (nadie vota su propia respuesta). Con eligibleVoters = 1 (salas de 2
 * jugadores), basta 1 voto "válida" para que la palabra pase.
 */
export function tallyVotes(votes: { valid: boolean }[], eligibleVoters: number): boolean {
  if (eligibleVoters <= 0) return false;
  const validCount = votes.filter((v) => v.valid).length;
  return validCount * 2 > eligibleVoters;
}

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

export async function getLeaderboard(gameType: string, limit: number): Promise<LeaderboardRow[]> {
  const { data } = await supabase
    .from('leaderboard')
    .select('*')
    .eq('game_type', gameType)
    .order('best_score', { ascending: false })
    .limit(limit);
  return (data as LeaderboardRow[]) || [];
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
