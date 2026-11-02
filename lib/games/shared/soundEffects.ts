// Efectos de sonido sintetizados con Web Audio (sin archivos ni derechos de
// autor) y vibración en los móviles que la soportan. El navegador no deja
// sonar nada hasta que el usuario toca la página, así que unlock() se engancha
// al primer toque o tecla. La preferencia (activado/desactivado) se guarda
// por dispositivo y vale para todas las salas.

const STORAGE_KEY = 'sfx_enabled';

type Wave = OscillatorType;

export function readSoundPreference(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function storeSoundPreference(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    /* sin almacenamiento: sólo dura esta visita */
  }
}

export function createSoundEffects() {
  let ctx: AudioContext | null = null;
  let enabled = true;

  function context(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!ctx) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /** Llamar dentro de un gesto del usuario (toque, clic, tecla). */
  function unlock() {
    context();
  }

  function tone(freq: number, start: number, duration: number, gain: number, wave: Wave = 'sine', slideTo?: number) {
    const c = ctx;
    if (!c || !enabled) return;
    const t0 = c.currentTime + start;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  function ready(): boolean {
    return enabled && !!ctx && ctx.state === 'running';
  }

  function vibrate(pattern: number | number[]) {
    if (!enabled) return;
    try {
      navigator.vibrate?.(pattern);
    } catch {
      /* no soportado */
    }
  }

  return {
    unlock,
    setEnabled(value: boolean) {
      enabled = value;
      if (value) context();
    },
    /** Clic seco de la ruleta de letras. */
    letterTick() {
      if (ready()) tone(1400, 0, 0.03, 0.05, 'square');
    },
    /** La letra cae: acorde corto ascendente. */
    letterLand() {
      if (!ready()) return;
      tone(523.25, 0, 0.18, 0.12, 'triangle');
      tone(659.25, 0.06, 0.18, 0.1, 'triangle');
      tone(783.99, 0.12, 0.3, 0.1, 'triangle');
      vibrate(25);
    },
    /** Cuenta atrás de los últimos segundos (más agudo cuanto menos queda). */
    countdownTick(secondsLeft: number) {
      if (ready()) tone(secondsLeft <= 3 ? 1046.5 : 880, 0, 0.09, 0.09, 'sine');
      if (secondsLeft <= 3) vibrate(30);
    },
    /** ¡Stop!: zumbido descendente. */
    stopBuzz() {
      if (ready()) {
        tone(440, 0, 0.35, 0.12, 'sawtooth', 110);
        tone(220, 0, 0.35, 0.08, 'square', 80);
      }
      vibrate([80, 40, 80]);
    },
    /** Puntos de la ronda calculados. */
    pointsChime() {
      if (!ready()) return;
      tone(783.99, 0, 0.15, 0.08, 'sine');
      tone(1046.5, 0.1, 0.25, 0.08, 'sine');
    },
    /** Fin de partida. */
    fanfare() {
      if (!ready()) return;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => tone(f, i * 0.12, 0.22, 0.1, 'triangle'));
      tone(1046.5, 0.5, 0.6, 0.1, 'triangle');
      tone(783.99, 0.5, 0.6, 0.07, 'triangle');
      vibrate([60, 40, 60, 40, 120]);
    },
    dispose() {
      if (ctx) {
        ctx.close();
        ctx = null;
      }
    },
  };
}

export type SoundEffects = ReturnType<typeof createSoundEffects>;
