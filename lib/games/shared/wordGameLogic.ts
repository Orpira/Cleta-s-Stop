// Compartido entre los juegos de escritura con letra (Stop, Categorías
// rápidas). No es genérico a nivel de núcleo: sortea letras y valida/puntúa
// palabras, algo que no tiene sentido para juegos como Triki.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.replace(/[ÑWKX]/g, ''); // letras jugables por defecto en es-ES

/**
 * excludeLetters: nunca se repiten mientras haya alternativa (p.ej. letras ya
 * usadas en rondas anteriores de esta misma partida).
 * softExcludeLetters: se evitan si es posible, pero ceden ante excludeLetters
 * (p.ej. letras usadas en partidas recientes en este dispositivo). Si no
 * queda ninguna letra que cumpla ambas restricciones, se ignora primero el
 * soft-exclude y, como último recurso, el exclude.
 */
export function drawRandomLetter(excludeLetters: string[] = [], softExcludeLetters: string[] = []): string {
  const hardPool = ALPHABET.split('').filter((l) => !excludeLetters.includes(l));
  const preferredPool = hardPool.filter((l) => !softExcludeLetters.includes(l));
  const source = preferredPool.length > 0 ? preferredPool : hardPool.length > 0 ? hardPool : ALPHABET.split('');
  return source[Math.floor(Math.random() * source.length)];
}

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
