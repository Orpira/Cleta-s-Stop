// Música de fondo sintetizada con Web Audio (sin archivos externos, sin
// derechos de autor de por medio): un arpegio suave en loop mientras dura
// la ronda. ensureContext() debe llamarse dentro del propio click del
// usuario que activa la música, para respetar las políticas de autoplay
// del navegador; start()/stop() sólo agendan/cancelan las notas.

const NOTES = [261.63, 329.63, 392.0, 523.25, 392.0, 329.63]; // C4 E4 G4 C5 G4 E4
const NOTE_INTERVAL_MS = 700;
const NOTE_DURATION_S = 0.6;
const NOTE_GAIN = 0.04;

export function createRoundMusic() {
  let ctx: AudioContext | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;
  let noteIndex = 0;

  function ensureContext(): AudioContext {
    if (!ctx) {
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      ctx = new AudioContextCtor();
    }
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    return ctx;
  }

  function playNote(frequency: number) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(NOTE_GAIN, ctx.currentTime + 0.05);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + NOTE_DURATION_S);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + NOTE_DURATION_S);
  }

  function start() {
    if (interval) return;
    ensureContext();
    playNote(NOTES[noteIndex]);
    interval = setInterval(() => {
      noteIndex = (noteIndex + 1) % NOTES.length;
      playNote(NOTES[noteIndex]);
    }, NOTE_INTERVAL_MS);
  }

  function stop() {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
    noteIndex = 0;
  }

  function dispose() {
    stop();
    if (ctx) {
      ctx.close();
      ctx = null;
    }
  }

  return { ensureContext, start, stop, dispose };
}

export type RoundMusic = ReturnType<typeof createRoundMusic>;
