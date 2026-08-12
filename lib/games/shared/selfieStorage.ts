// Selfie de cada jugador, guardada SOLO en el navegador local (no se sube a
// ningún servidor). Por eso sólo el propio dueño la ve en la pantalla final;
// los demás jugadores no tienen acceso a esos bytes.

function storageKey(gameType: string, code: string): string {
  return `selfie_${gameType}_${code}`;
}

export function getStoredSelfie(gameType: string, code: string): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(storageKey(gameType, code));
}

export function storeSelfie(gameType: string, code: string, dataUrl: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(storageKey(gameType, code), dataUrl);
}

export function clearSelfie(gameType: string, code: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(storageKey(gameType, code));
}
