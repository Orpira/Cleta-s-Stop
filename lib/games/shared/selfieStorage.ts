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

/**
 * Devuelve true si se pudo guardar. localStorage tiene ~5 MB por origen y
 * puede estar bloqueado (modo privado), así que nunca debe romper la UI.
 */
export function storeSelfie(gameType: string, code: string, dataUrl: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    localStorage.setItem(storageKey(gameType, code), dataUrl);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reduce la foto a un cuadrado de `size` px en JPEG. Una foto de móvil sin
 * reducir pesa varios MB y no cabe en localStorage.
 */
export async function shrinkSelfie(file: File, size = 256): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas_unavailable');
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function clearSelfie(gameType: string, code: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(storageKey(gameType, code));
}
