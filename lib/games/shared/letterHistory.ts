// Recuerda, por dispositivo, las últimas letras sorteadas en cada juego de
// palabras para que partidas distintas jugadas seguidas no repitan letra
// (además de excludeLetters, que evita repetir dentro de la misma partida).

const STORAGE_PREFIX = 'recent_letters_';
const MAX_REMEMBERED = 8;

export function getRecentLetters(gameType: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + gameType);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function rememberLetter(gameType: string, letter: string): void {
  if (typeof window === 'undefined') return;
  const recent = getRecentLetters(gameType).filter((l) => l !== letter);
  recent.unshift(letter);
  localStorage.setItem(STORAGE_PREFIX + gameType, JSON.stringify(recent.slice(0, MAX_REMEMBERED)));
}
