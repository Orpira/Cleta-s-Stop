import { supabase, Player, LeaderboardRow } from './supabaseClient';

export type ValidationMode = 'vote' | 'host' | 'auto_nonempty';

export interface Answer {
  id: string;
  round_id: string;
  player_id: string;
  category: string;
  word: string;
  is_valid: boolean | null;
  points: number;
}

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

/**
 * Puntuación genérica por ronda, aplicada según el modo de validación elegido por
 * los propios participantes en la configuración de la sala:
 *  - "vote": la palabra necesita mayoría de votos válidos de los demás jugadores
 *  - "host": solo cuenta el voto del host (is_valid ya viene decidido)
 *  - "auto_nonempty": válida si no está vacía y empieza por la letra correcta
 *
 * Puntuación (una vez determinada la validez):
 *  - 0 puntos si está vacía o inválida
 *  - 50 puntos si es válida pero repetida con otro jugador en la misma categoría
 *  - 100 puntos si es válida y única
 */
export function scoreRound(
  answers: Answer[],
  letter: string,
  settings: { validation_mode: ValidationMode }
): Answer[] {
  const byCategory: Record<string, Answer[]> = {};
  for (const a of answers) {
    byCategory[a.category] = byCategory[a.category] || [];
    byCategory[a.category].push(a);
  }

  const scored: Answer[] = [];

  for (const category of Object.keys(byCategory)) {
    const group = byCategory[category];

    const withValidity = group.map((a) => {
      let valid = a.is_valid;
      if (valid === null || valid === undefined) {
        if (settings.validation_mode === 'auto_nonempty') {
          valid = startsWithLetter(a.word, letter);
        } else {
          valid = false; // pendiente de voto/host, se resuelve antes de puntuar
        }
      }
      return { ...a, is_valid: valid };
    });

    const normalizedCounts: Record<string, number> = {};
    for (const a of withValidity) {
      if (a.is_valid && a.word.trim()) {
        const key = normalize(a.word);
        normalizedCounts[key] = (normalizedCounts[key] || 0) + 1;
      }
    }

    for (const a of withValidity) {
      let points = 0;
      if (a.is_valid && a.word.trim()) {
        const key = normalize(a.word);
        points = normalizedCounts[key] > 1 ? 50 : 100;
      }
      scored.push({ ...a, points });
    }
  }

  return scored;
}

function normalize(word: string): string {
  return word.trim().toLowerCase();
}

function startsWithLetter(word: string, letter: string): boolean {
  return word.trim().toUpperCase().startsWith(letter.toUpperCase()) && word.trim().length > 0;
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
