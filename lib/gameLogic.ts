import { Answer, RoomSettings } from './supabaseClient';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.replace(/[ÑWKX]/g, ''); // letras jugables por defecto en es-ES

export function drawRandomLetter(excludeLetters: string[] = []): string {
  const pool = ALPHABET.split('').filter((l) => !excludeLetters.includes(l));
  const source = pool.length > 0 ? pool : ALPHABET.split('');
  return source[Math.floor(Math.random() * source.length)];
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin caracteres ambiguos
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

/**
 * Reglas clásicas del Stop, aplicadas según el modo de validación elegido
 * por los propios participantes en la configuración de la sala:
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
  settings: RoomSettings
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

/**
 * eligibleVoters = jugadores que SÍ pueden votar esta respuesta, es decir,
 * el total de jugadores de la sala MENOS el propio autor de la palabra
 * (nadie vota su propia respuesta). Con eligibleVoters = 1 (salas de 2
 * jugadores), basta 1 voto "válida" para que la palabra pase.
 */
export function tallyVotes(
  votes: { valid: boolean }[],
  eligibleVoters: number
): boolean {
  if (eligibleVoters <= 0) return false;
  const validCount = votes.filter((v) => v.valid).length;
  return validCount * 2 > eligibleVoters;
}
