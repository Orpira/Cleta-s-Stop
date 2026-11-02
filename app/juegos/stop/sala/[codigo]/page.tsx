'use client';

import { ChangeEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase, Player } from '@/lib/core/supabaseClient';
import { getStoredPlayerId, joinRoom } from '@/lib/core/roomActions';
import { applyRoundScores, upsertLeaderboardResult } from '@/lib/core/scoring';
import {
  drawRandomLetter,
  tallyVotes,
  tallyCastVotes,
  isRoundFullyValidated,
  Answer,
  Vote,
  ValidationMode,
  scoreRound,
} from '@/lib/games/shared/wordGameLogic';
import { getRecentLetters, rememberLetter } from '@/lib/games/shared/letterHistory';
import { getHintWord } from '@/lib/games/shared/wordBank';
import { createRoundMusic } from '@/lib/games/shared/roundMusic';
import { createSoundEffects, readSoundPreference, SoundEffects, storeSoundPreference } from '@/lib/games/shared/soundEffects';
import { getStoredSelfie, shrinkSelfie, storeSelfie } from '@/lib/games/shared/selfieStorage';
import { StopRoom, StopSettings } from '@/lib/games/stop/gameLogic';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PlayerChip } from '@/components/ui/PlayerChip';
import { ScoreTable } from '@/components/ui/ScoreTable';
import { Podium } from '@/components/ui/Podium';
import { Stamp } from '@/components/ui/Stamp';

const GAME_TYPE = 'stop';

/** Espera tras la última tecla antes de guardar las respuestas. */
const SAVE_DEBOUNCE_MS = 600;
/** Margen para que un jugador que no es anfitrión cierre la ronda si el
 * anfitrión no lo hace (desconectado, pestaña dormida…). */
const NON_HOST_END_GRACE_S = 6;
/** Tiempo sin ver al anfitrión conectado antes de que otro tome el relevo. */
const HOST_HANDOVER_MS = 45000;
const CLOCK_OFFSET_KEY = 'server_clock_offset_ms';
/** La ruleta de la letra sólo se anima si la ronda acaba de empezar (no al recargar). */
const REVEAL_WINDOW_MS = 4000;
/** Últimos segundos con cuenta atrás sonora. */
const COUNTDOWN_FROM = 5;
/** Últimos segundos con el reloj en alerta. */
const URGENT_FROM = 10;

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Diferencia entre el reloj de este dispositivo y el del servidor
 * (local - servidor, incluye la latencia, que siempre suma). Se mide con las
 * marcas de tiempo del servidor que llegan en cada evento y se guarda: es
 * propia del dispositivo, no de la sala.
 */
function readStoredClockOffset(): number | null {
  try {
    const v = Number(localStorage.getItem(CLOCK_OFFSET_KEY));
    return localStorage.getItem(CLOCK_OFFSET_KEY) !== null && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

export default function StopRoomPage() {
  const params = useParams<{ codigo: string }>();
  const code = (params.codigo || '').toUpperCase();

  const [room, setRoom] = useState<StopRoom | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [roundStartedAt, setRoundStartedAt] = useState<string | null>(null);
  const [roundNumber, setRoundNumber] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [presentIds, setPresentIds] = useState<string[] | null>(null); // null = presencia aún sin sincronizar
  const [error, setError] = useState('');

  const roomRef = useRef<StopRoom | null>(null);
  roomRef.current = room;
  const roundIdRef = useRef<string | null>(null);
  roundIdRef.current = roundId;
  const myPlayerIdRef = useRef<string | null>(null);
  myPlayerIdRef.current = myPlayerId;
  const answersRef = useRef<Answer[]>([]);
  answersRef.current = answers;
  const draftRef = useRef<Record<string, string>>({});
  draftRef.current = draft;
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>('');
  const resolvingRef = useRef(false);
  const roundNumberRef = useRef<number | null>(null);
  roundNumberRef.current = roundNumber;
  const clockOffsetRef = useRef<number | null>(null);
  const offsetFreshRef = useRef(false);

  const noteServerTime = useCallback((iso?: string | null) => {
    if (!iso) return;
    const measured = Date.now() - Date.parse(iso);
    if (!Number.isFinite(measured)) return;
    // la latencia sólo suma, así que la medida más baja es la más fiable;
    // la primera medida de la sesión reemplaza a la guardada
    const next = offsetFreshRef.current && clockOffsetRef.current !== null
      ? Math.min(clockOffsetRef.current, measured)
      : measured;
    offsetFreshRef.current = true;
    clockOffsetRef.current = next;
    try {
      localStorage.setItem(CLOCK_OFFSET_KEY, String(next));
    } catch {
      /* sin almacenamiento: sólo se usa en memoria */
    }
  }, []);

  useEffect(() => {
    if (clockOffsetRef.current === null) clockOffsetRef.current = readStoredClockOffset();
  }, []);
  const musicRef = useRef(createRoundMusic());
  const [musicEnabled, setMusicEnabled] = useState(false);
  const sfxRef = useRef<SoundEffects>(createSoundEffects());
  const [soundOn, setSoundOn] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [stoppedBy, setStoppedBy] = useState<string | null>(null);
  const [stopFlash, setStopFlash] = useState(false);
  const [animateReveal, setAnimateReveal] = useState(false);

  const me = players.find((p) => p.id === myPlayerId) || null;
  const isHost = !!me?.is_host;
  const settings = (room?.settings || {}) as StopSettings;
  const settingsRef = useRef<StopSettings>(settings);
  settingsRef.current = settings;
  const isHostRef = useRef(false);
  isHostRef.current = isHost;

  // --- carga inicial ---
  useEffect(() => {
    if (!code) return;

    (async () => {
      const { data: r } = await supabase
        .from('rooms')
        .select('*')
        .eq('code', code)
        .eq('game_type', GAME_TYPE)
        .single();
      if (!r) {
        setError('Esta sala no existe o ya terminó.');
        return;
      }
      const { data: pls } = await supabase.from('players').select('*').eq('room_id', r.id).order('joined_at');
      const list = (pls as Player[]) || [];

      // la ronda en curso o en revisión (ya con ended_at) se recupera al
      // recargar; antes sólo se recuperaba si no había terminado y la
      // revisión quedaba vacía
      // también entre rondas, para mostrar los puntos de la última ronda
      if (r.status === 'playing' || r.status === 'round_review' || (r.status === 'lobby' && r.current_round > 0)) {
        const { data: latestRound } = await supabase
          .from('rounds')
          .select('*')
          .eq('room_id', r.id)
          .order('round_number', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (latestRound) {
          setRoundId(latestRound.id);
          setRoundStartedAt(latestRound.started_at);
          setRoundNumber(latestRound.round_number);
          setStoppedBy(latestRound.stopped_by ?? null);
        }
      }

      // un id guardado de otra sala con el mismo código (o de un jugador ya
      // borrado) no cuenta: se ofrece unirse de nuevo
      const stored = getStoredPlayerId(GAME_TYPE, code);
      setMyPlayerId(stored && list.some((p) => p.id === stored) ? stored : null);
      setPlayers(list);
      setRoom(r as StopRoom);
      setLoaded(true);
    })();
  }, [code]);

  // --- respuestas y votos de la ronda actual (al entrar, recargar o empezar ronda) ---
  useEffect(() => {
    if (!roundId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('answers').select('*').eq('round_id', roundId);
      if (cancelled) return;
      const list = (data as Answer[]) || [];
      setAnswers(list);

      const mine = list.filter((a) => a.player_id === myPlayerIdRef.current);
      if (mine.length > 0) {
        const restored = Object.fromEntries(mine.map((a) => [a.category, a.word]));
        lastSavedRef.current = JSON.stringify(restored);
        setDraft((d) => (Object.keys(d).length > 0 ? d : restored));
      }

      if (list.length > 0) {
        const { data: v } = await supabase
          .from('validation_votes')
          .select('*')
          .in('answer_id', list.map((a) => a.id));
        if (!cancelled) setVotes((v as Vote[]) || []);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roundId]);

  // --- tiempo real + presencia ---
  // Un único canal por sala: supabase-js reutiliza un canal con el mismo
  // nombre mientras se está cerrando, así que no se rehace al unirse; cada
  // pestaña publica en su presencia qué jugador es (o ninguno, si sólo mira).
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const subscribedRef = useRef(false);

  useEffect(() => {
    if (!room?.id) return;

    const channel = supabase.channel(`room-${room.id}`, {
      config: { presence: { key: crypto.randomUUID() } },
    });
    channelRef.current = channel;

    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}` }, (payload) => {
        noteServerTime(payload.commit_timestamp);
        setRoom(payload.new as StopRoom);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${room.id}` }, async () => {
        const { data: pls } = await supabase.from('players').select('*').eq('room_id', room.id).order('joined_at');
        setPlayers((pls as Player[]) || []);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rounds', filter: `room_id=eq.${room.id}` }, (payload) => {
        noteServerTime(payload.commit_timestamp);
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        lastSavedRef.current = '';
        setRoundId(payload.new.id as string);
        setRoundStartedAt(payload.new.started_at as string);
        setRoundNumber(payload.new.round_number as number);
        setStoppedBy(null);
        setSaveStatus('idle');
        setAnswers([]);
        setVotes([]);
        setDraft({});
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'answers' }, async (payload) => {
        noteServerTime(payload.commit_timestamp);
        const rId = (payload.new as any)?.round_id || (payload.old as any)?.round_id;
        if (rId && rId === roundIdRef.current) {
          const { data } = await supabase.from('answers').select('*').eq('round_id', rId);
          setAnswers((data as Answer[]) || []);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'validation_votes' }, async () => {
        const answerIds = answersRef.current.map((a) => a.id);
        if (answerIds.length === 0) return;
        const { data } = await supabase.from('validation_votes').select('*').in('answer_id', answerIds);
        setVotes((data as Vote[]) || []);
      })
      .on('presence', { event: 'sync' }, () => {
        const metas = Object.values(channel.presenceState()).flat() as { player_id?: string | null }[];
        setPresentIds(Array.from(new Set(metas.map((m) => m.player_id).filter((id): id is string => !!id))));
      })
      .subscribe(async (status) => {
        subscribedRef.current = status === 'SUBSCRIBED';
        if (status === 'SUBSCRIBED') {
          await channel.track({ player_id: myPlayerIdRef.current });
        }
      });

    return () => {
      subscribedRef.current = false;
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [room?.id, noteServerTime]);

  // al unirse desde el enlace, la presencia pasa de "espectador" a jugador
  useEffect(() => {
    if (channelRef.current && subscribedRef.current) {
      channelRef.current.track({ player_id: myPlayerId });
    }
  }, [myPlayerId]);

  // --- relevo de anfitrión: si el anfitrión no está conectado durante un
  // rato, el jugador conectado que lleva más tiempo en la sala toma el
  // control (si no, la partida se quedaba bloqueada para siempre) ---
  const host = players.find((p) => p.is_host) || null;
  const presentKey = presentIds ? presentIds.slice().sort().join('|') : null;
  const hostPresent = !!host && !!presentIds && presentIds.includes(host.id);
  const successorId = presentIds ? players.find((p) => presentIds.includes(p.id))?.id ?? null : null;

  useEffect(() => {
    if (presentKey === null || hostPresent || !myPlayerId || successorId !== myPlayerId) return;
    if (room?.status === 'finished') return;
    const t = setTimeout(async () => {
      if (host) await supabase.from('players').update({ is_host: false }).eq('id', host.id);
      await supabase.from('players').update({ is_host: true }).eq('id', myPlayerId);
    }, HOST_HANDOVER_MS);
    return () => clearTimeout(t);
  }, [presentKey, hostPresent, successorId, myPlayerId, host?.id, room?.status]);

  // --- guardado de respuestas ---
  const saveMyAnswers = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const rId = roundIdRef.current;
    const pId = myPlayerIdRef.current;
    const categories = settingsRef.current.categories || [];
    if (!rId || !pId || categories.length === 0) return;

    const snapshot = Object.fromEntries(categories.map((c) => [c, draftRef.current[c] || '']));
    const serialized = JSON.stringify(snapshot);
    if (serialized === lastSavedRef.current) return;

    const rows = categories.map((category) => ({
      round_id: rId,
      player_id: pId,
      category,
      word: snapshot[category],
    }));
    setSaveStatus('saving');
    const { error: saveError } = await supabase
      .from('answers')
      .upsert(rows, { onConflict: 'round_id,player_id,category' });
    if (!saveError) {
      lastSavedRef.current = serialized;
      setSaveStatus('saved');
    } else {
      // sin conexión o error puntual: se reintenta solo
      setSaveStatus('error');
      saveTimerRef.current = setTimeout(() => saveMyAnswers(), 3000);
    }
  }, []);

  function updateDraft(category: string, value: string) {
    setDraft((d) => ({ ...d, [category]: value }));
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(saveMyAnswers, SAVE_DEBOUNCE_MS);
  }

  // si la ronda termina (¡Stop! de otro jugador o fin del tiempo) mientras
  // aún hay cambios sin guardar, se guardan igualmente
  const prevStatusRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = room?.status;
    if (prev === 'playing' && room?.status !== 'playing') saveMyAnswers();

    // efectos al cambiar de fase (no al cargar la página: prev indefinido)
    if (prev === 'playing' && room?.status === 'round_review') {
      sfxRef.current.stopBuzz();
      setStopFlash(true);
      setTimeout(() => setStopFlash(false), 1300);
      // quién pulsó ¡Stop! (null = se acabó el tiempo)
      const rId = roundIdRef.current;
      if (rId) {
        supabase
          .from('rounds')
          .select('stopped_by')
          .eq('id', rId)
          .maybeSingle()
          .then(({ data }) => setStoppedBy((data as any)?.stopped_by ?? null));
      }
    }
    if (prev && prev !== 'finished' && room?.status === 'finished') {
      sfxRef.current.fanfare();
    }
  }, [room?.status, saveMyAnswers]);

  // --- sonidos: preferencia guardada y desbloqueo con el primer toque ---
  useEffect(() => {
    const on = readSoundPreference();
    setSoundOn(on);
    sfxRef.current.setEnabled(on);
    const sfx = sfxRef.current;
    const unlock = () => sfx.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', unlock, { capture: true });
      window.removeEventListener('keydown', unlock, { capture: true });
      sfx.dispose();
    };
  }, []);

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    storeSoundPreference(next);
    sfxRef.current.setEnabled(next);
  }

  // la ruleta de la letra se anima sólo si la ronda acaba de empezar
  useEffect(() => {
    if (!roundStartedAt) return;
    const serverNow = Date.now() - (clockOffsetRef.current ?? 0);
    setAnimateReveal(serverNow - Date.parse(roundStartedAt) < REVEAL_WINDOW_MS);
  }, [roundStartedAt]);

  // cuenta atrás sonora de los últimos segundos
  const lastTickRef = useRef<number | null>(null);
  useEffect(() => {
    if (room?.status !== 'playing' || secondsLeft === null) {
      lastTickRef.current = null;
      return;
    }
    if (secondsLeft >= 1 && secondsLeft <= COUNTDOWN_FROM && lastTickRef.current !== secondsLeft) {
      lastTickRef.current = secondsLeft;
      sfxRef.current.countdownTick(secondsLeft);
    }
  }, [secondsLeft, room?.status]);

  // --- fin de ronda (idempotente: sólo pasa a revisión si la sala sigue
  // jugando esa misma ronda, así no importa quién ni cuántos lo llamen) ---
  const endRound = useCallback(async (stoppedBy?: string) => {
    const r = roomRef.current;
    const rId = roundIdRef.current;
    const rNumber = roundNumberRef.current;
    if (!r || !rId || rNumber === null) return;
    await supabase
      .from('rounds')
      .update({ ended_at: new Date().toISOString(), ...(stoppedBy && { stopped_by: stoppedBy }) })
      .eq('id', rId)
      .is('ended_at', null);
    await supabase
      .from('rooms')
      .update({ status: 'round_review' })
      .eq('id', r.id)
      .eq('status', 'playing')
      .eq('current_round', rNumber);
  }, []);

  async function handleStop() {
    await saveMyAnswers();
    await endRound(myPlayerId || undefined);
  }

  // --- temporizador: se calcula desde el inicio real de la ronda
  // (rounds.started_at, hora del servidor corregida con el desfase de este
  // reloj), así es el mismo para todos y no se reinicia al recargar. Cierra
  // la ronda el anfitrión; el resto, con un margen, por si el anfitrión no
  // está. Un dispositivo que aún no midió su desfase sólo muestra la cuenta ---
  const timerActive =
    room?.status === 'playing' && !!roundStartedAt && roundNumber === room?.current_round && !!settings.round_seconds;

  useEffect(() => {
    if (!timerActive || !roundStartedAt) {
      setSecondsLeft(null);
      return;
    }
    const total = settings.round_seconds;
    const startMs = Date.parse(roundStartedAt);
    let ended = false;
    const tick = () => {
      const offset = clockOffsetRef.current;
      const serverNow = Date.now() - (offset ?? 0);
      const remaining = total - (serverNow - startMs) / 1000;
      setSecondsLeft(Math.min(total, Math.max(0, Math.ceil(remaining))));
      const limit = isHostRef.current ? 0 : -NON_HOST_END_GRACE_S;
      if (!ended && offset !== null && remaining <= limit) {
        ended = true;
        saveMyAnswers().then(() => endRound());
      }
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [timerActive, roundStartedAt, settings.round_seconds, saveMyAnswers, endRound]);

  // --- música de fondo (sintetizada, sólo si el jugador la activa) ---
  useEffect(() => {
    if (musicEnabled && room?.status === 'playing') {
      musicRef.current.start();
    } else {
      musicRef.current.stop();
    }
  }, [musicEnabled, room?.status]);

  useEffect(() => {
    const music = musicRef.current;
    return () => music.dispose();
  }, []);

  function toggleMusic() {
    if (!musicEnabled) musicRef.current.ensureContext();
    setMusicEnabled((v) => !v);
  }

  // --- unirse desde el enlace de la sala ---
  async function handleJoin(nickname: string) {
    const { room: joined, player } = await joinRoom(GAME_TYPE, code, nickname);
    const { data: pls } = await supabase.from('players').select('*').eq('room_id', joined.id).order('joined_at');
    setPlayers((pls as Player[]) || []);
    setMyPlayerId(player.id);
  }

  // --- acciones del host: configuración ---
  async function updateSettings(patch: Partial<StopSettings>) {
    if (!room) return;
    const newSettings = { ...settings, ...patch };
    await supabase.from('rooms').update({ settings: newSettings }).eq('id', room.id);
  }

  // evita repetir letra dentro de la misma partida (rondas ya jugadas en
  // esta sala) y, si es posible, también respecto a partidas recientes en
  // este dispositivo
  async function pickRoundLetter(): Promise<string> {
    const { data: pastRounds } = await supabase.from('rounds').select('letter').eq('room_id', room!.id);
    const usedInRoom = ((pastRounds || []).map((r) => r.letter).filter(Boolean)) as string[];
    const letter = drawRandomLetter(usedInRoom, getRecentLetters(GAME_TYPE));
    rememberLetter(GAME_TYPE, letter);
    return letter;
  }

  async function startRound(roundNumber: number) {
    if (!room) return;
    const letter = await pickRoundLetter();
    const { data: newRound } = await supabase
      .from('rounds')
      .insert({ room_id: room.id, round_number: roundNumber, letter })
      .select()
      .single();
    await supabase
      .from('rooms')
      .update({ status: 'playing', current_round: roundNumber, current_letter: letter })
      .eq('id', room.id);
    if (newRound) {
      noteServerTime(newRound.started_at);
      setRoundId(newRound.id);
      setRoundStartedAt(newRound.started_at);
      setRoundNumber(newRound.round_number);
    }
  }

  const startGame = () => startRound(1);
  const nextRound = () => startRound((room?.current_round || 0) + 1);

  // --- validación + puntuación (host resuelve). Con force=true se cierra
  // la votación con los votos emitidos hasta el momento ---
  async function resolveRoundScores(force = false) {
    if (!room || !roundId || resolvingRef.current) return;
    resolvingRef.current = true;
    try {
      const { data: allAnswers } = await supabase.from('answers').select('*').eq('round_id', roundId);
      if (!allAnswers) return;

      let resolved = allAnswers as Answer[];

      if (settings.validation_mode === 'vote') {
        const { data: votesData } = await supabase
          .from('validation_votes')
          .select('*')
          .in('answer_id', resolved.map((a) => a.id));
        resolved = resolved.map((a) => {
          const answerVotes = (votesData || []).filter((v: any) => v.answer_id === a.id);
          const eligibleVoters = players.filter((p) => p.id !== a.player_id).length;
          const valid = force ? tallyCastVotes(answerVotes) : tallyVotes(answerVotes, eligibleVoters);
          return { ...a, is_valid: valid };
        });
      } else if (settings.validation_mode === 'host' && force) {
        // lo que el anfitrión no llegó a marcar cuenta como válido
        resolved = resolved.map((a) => (a.is_valid === null || a.is_valid === undefined ? { ...a, is_valid: true } : a));
      }

      const scored = scoreRound(resolved, room.current_letter || '', settings);

      for (const a of scored) {
        await supabase.from('answers').update({ is_valid: a.is_valid, points: a.points }).eq('id', a.id);
      }

      await applyRoundScores(players, scored);
    } finally {
      resolvingRef.current = false;
    }
  }

  // el host confirma que ya vio la puntuación de la ronda y continúa
  async function continueAfterReview() {
    if (!room) return;
    const isLastRound = room.current_round >= settings.rounds_to_play;
    if (isLastRound) {
      await finishGame();
    } else {
      await supabase.from('rooms').update({ status: 'lobby' }).eq('id', room.id);
    }
  }

  async function finishGame() {
    if (!room) return;
    const { data: updated } = await supabase
      .from('rooms')
      .update({ status: 'finished' })
      .eq('id', room.id)
      .neq('status', 'finished')
      .select();
    if (!updated || updated.length === 0) return; // otro ya la cerró: no duplicar ranking
    for (const p of players) {
      await upsertLeaderboardResult(GAME_TYPE, p.nickname, p.total_score);
    }
  }

  async function castVote(answerId: string, valid: boolean) {
    if (!me) return;
    await supabase.from('validation_votes').upsert(
      { answer_id: answerId, voter_id: me.id, valid },
      { onConflict: 'answer_id,voter_id' }
    );
  }

  async function castHostDecision(answerId: string, valid: boolean) {
    await supabase.from('answers').update({ is_valid: valid }).eq('id', answerId);
  }

  if (error) {
    return (
      <Sheet brand="orpira.es · sala">
        <p>{error}</p>
        <p style={{ marginTop: 12 }}>
          <a href="/juegos/stop" style={{ color: 'var(--ink-blue)' }}>Crear o buscar otra sala →</a>
        </p>
      </Sheet>
    );
  }

  if (!room || !loaded) {
    return (
      <Sheet brand="orpira.es · sala">
        <p>Cargando sala…</p>
      </Sheet>
    );
  }

  const header = (
    <div className="row" style={{ alignItems: 'baseline', marginBottom: 8 }}>
      <h1 className="title" style={{ fontSize: 34 }}>¡Stop!</h1>
      <span className="code-display">{room.code}</span>
      <span className="row" style={{ gap: 6, flex: '0 0 auto' }}>
        <Button
          variant="ghost"
          style={{ fontSize: 12, padding: '6px 10px', flex: '0 0 auto' }}
          onClick={toggleSound}
          aria-pressed={soundOn}
        >
          {soundOn ? '🔔 Sonidos' : '🔕 Sonidos'}
        </Button>
        <Button
          variant="ghost"
          style={{ fontSize: 12, padding: '6px 10px', flex: '0 0 auto' }}
          onClick={toggleMusic}
          aria-pressed={musicEnabled}
        >
          {musicEnabled ? '🔊 Música' : '🔇 Música'}
        </Button>
      </span>
    </div>
  );

  if (!me && room.status !== 'finished') {
    return (
      <Sheet brand="orpira.es · sala" maxWidth={640}>
        {header}
        <JoinFromLink
          players={players}
          maxPlayers={settings.max_players}
          inProgress={room.status !== 'lobby' || room.current_round > 0}
          onJoin={handleJoin}
        />
      </Sheet>
    );
  }

  const hostAbsent = !!presentIds && !hostPresent && room.status !== 'finished';

  return (
    <Sheet brand="orpira.es · sala" maxWidth={640} leaveWarning={room.status === 'playing' || room.status === 'round_review'}>
      {header}

      {hostAbsent && (
        <p className="notice">
          {host ? `${host.nickname} (anfitrión) parece desconectado.` : 'No hay anfitrión.'}{' '}
          {successorId === myPlayerId
            ? 'Si no vuelve en unos segundos, pasarás a ser el anfitrión.'
            : 'Si no vuelve en unos segundos, otro jugador tomará el control.'}
        </p>
      )}

      {room.status === 'lobby' && room.current_round === 0 && (
        <LobbySettings
          settings={settings}
          isHost={isHost}
          players={players}
          presentIds={presentIds}
          onChange={updateSettings}
          onStart={startGame}
          code={code}
        />
      )}

      {room.status === 'lobby' && room.current_round > 0 && (
        <RoundScoreboard
          players={players}
          currentRound={room.current_round}
          totalRounds={settings.rounds_to_play}
          isHost={isHost}
          onNext={nextRound}
          answers={answers}
          meId={myPlayerId}
        />
      )}

      {room.status === 'playing' && (
        <GameBoard
          letter={room.current_letter || ''}
          categories={settings.categories}
          showHints={settings.show_hints}
          draft={draft}
          onChange={updateDraft}
          onSave={saveMyAnswers}
          secondsLeft={secondsLeft}
          secondsTotal={settings.round_seconds}
          onStop={handleStop}
          animateReveal={animateReveal}
          sfx={sfxRef.current}
          saveStatus={saveStatus}
          players={players}
          answers={answers}
          meId={myPlayerId}
        />
      )}

      {room.status === 'round_review' && (
        <RoundReview
          answers={answers}
          players={players}
          categories={settings.categories}
          validationMode={settings.validation_mode}
          votes={votes}
          me={me}
          onVote={castVote}
          onHostDecision={castHostDecision}
          isHost={isHost}
          onResolve={resolveRoundScores}
          onContinue={continueAfterReview}
          stoppedByName={stoppedBy ? players.find((p) => p.id === stoppedBy)?.nickname ?? null : null}
          sfx={sfxRef.current}
        />
      )}

      {room.status === 'finished' && <FinalResults players={players} me={me} code={code} />}

      {stopFlash && (
        <div className="stop-flash" aria-hidden="true">
          <Stamp>¡STOP!</Stamp>
        </div>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------
// Unirse desde el enlace: quien abre /juegos/stop/sala/CODIGO sin ser
// jugador de la sala puede entrar aquí mismo, sin volver a la portada
// ---------------------------------------------------------------
function JoinFromLink({
  players,
  maxPlayers,
  inProgress,
  onJoin,
}: {
  players: Player[];
  maxPlayers: number;
  inProgress: boolean;
  onJoin: (nickname: string) => Promise<void>;
}) {
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [joinError, setJoinError] = useState('');
  const full = players.length >= maxPlayers;

  async function submit() {
    const name = nickname.trim();
    if (!name) return setJoinError('Escribe tu nombre para continuar.');
    if (players.some((p) => p.nickname.trim().toLowerCase() === name.toLowerCase())) {
      return setJoinError('Ya hay alguien con ese nombre en la sala. Prueba con otro.');
    }
    setLoading(true);
    setJoinError('');
    try {
      await onJoin(name);
    } catch (e: any) {
      setJoinError(e?.message === 'room_full' ? 'Esa sala ya está completa.' : 'No se pudo entrar. Intenta de nuevo.');
      setLoading(false);
    }
  }

  return (
    <>
      <p className="subtitle">
        {inProgress
          ? 'La partida ya empezó: entra y juegas desde la ronda actual.'
          : 'Te han invitado a esta sala. Escribe tu nombre para entrar.'}
      </p>

      {players.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <span className="field-label">En la sala ({players.length}/{maxPlayers})</span>
          {players.map((p) => (
            <PlayerChip key={p.id}>{p.nickname}</PlayerChip>
          ))}
        </div>
      )}

      {full ? (
        <p>Esta sala ya está completa.</p>
      ) : (
        <>
          <label className="field-label" htmlFor="join-nickname">Tu nombre</label>
          <Input
            id="join-nickname"
            placeholder="¿Cómo te llamas?"
            value={nickname}
            maxLength={24}
            autoComplete="nickname"
            onChange={(e) => setNickname(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            style={{ marginBottom: 16 }}
          />
          {joinError && <p style={{ color: 'var(--stamp-red)', fontSize: 14, marginBottom: 12 }}>{joinError}</p>}
          <Button variant="stop" style={{ width: '100%' }} disabled={loading} onClick={submit}>
            {loading ? 'Un momento…' : 'Entrar a la sala'}
          </Button>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------
// Lobby: aquí los propios participantes configuran la partida
// ---------------------------------------------------------------
function LobbySettings({
  settings,
  isHost,
  players,
  presentIds,
  onChange,
  onStart,
  code,
}: {
  settings: StopSettings;
  isHost: boolean;
  players: Player[];
  presentIds: string[] | null;
  onChange: (patch: Partial<StopSettings>) => void;
  onStart: () => void;
  code: string;
}) {
  const [shareMsg, setShareMsg] = useState('');
  const needsMorePlayers = settings.validation_mode === 'vote' && players.length < 2;

  async function shareLink() {
    const url = `${window.location.origin}/juegos/stop/sala/${code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: '¡Stop!', text: `Únete a mi partida de ¡Stop! (sala ${code})`, url });
        return;
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareMsg('Enlace copiado.');
    } catch {
      setShareMsg(url);
    }
  }

  const validationOptions: { value: ValidationMode; label: string }[] = [
    { value: 'vote', label: 'Votación entre jugadores' },
    { value: 'host', label: 'El anfitrión decide' },
    { value: 'auto_nonempty', label: 'Automático (empieza por la letra)' },
  ];

  return (
    <>
      <p className="subtitle">Comparte el enlace con tus amigos. Configura la partida antes de empezar.</p>

      <div style={{ marginBottom: 20 }}>
        <Button variant="ghost" style={{ width: '100%' }} onClick={shareLink}>
          🔗 Invitar con un enlace
        </Button>
        {shareMsg && <p style={{ fontSize: 12, color: '#6b7590', marginTop: 6, wordBreak: 'break-all' }}>{shareMsg}</p>}
      </div>

      <div style={{ marginBottom: 20 }}>
        <span className="field-label">Jugadores conectados ({players.length}/{settings.max_players})</span>
        {players.map((p) => (
          <PlayerChip key={p.id}>
            {p.nickname}
            {p.is_host ? ' · anfitrión' : ''}
            {presentIds && !presentIds.includes(p.id) && (
              <span style={{ marginLeft: 6, fontSize: 12, color: '#6b7590' }}>(desconectado)</span>
            )}
          </PlayerChip>
        ))}
      </div>

      <SelfiePicker gameType={GAME_TYPE} code={code} />

      {isHost ? (
        <>
          <div style={{ marginBottom: 18 }}>
            <span className="field-label">Cómo se validan las palabras</span>
            <div className="row">
              {validationOptions.map((opt) => (
                <Button
                  key={opt.value}
                  variant={settings.validation_mode === opt.value ? 'primary' : 'ghost'}
                  style={{ fontSize: 13 }}
                  onClick={() => onChange({ validation_mode: opt.value })}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="row" style={{ marginBottom: 18 }}>
            <NumberSetting
              id="max-players"
              label="Máx. de jugadores"
              min={Math.max(2, players.length)}
              max={30}
              value={settings.max_players}
              onCommit={(v) => onChange({ max_players: v })}
            />
            <NumberSetting
              id="round-seconds"
              label="Segundos por ronda"
              min={15}
              max={180}
              value={settings.round_seconds}
              onCommit={(v) => onChange({ round_seconds: v })}
            />
            <NumberSetting
              id="rounds-to-play"
              label="Nº de rondas"
              min={1}
              max={20}
              value={settings.rounds_to_play}
              onCommit={(v) => onChange({ rounds_to_play: v })}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <Button
              variant={settings.show_hints ? 'primary' : 'ghost'}
              style={{ fontSize: 13 }}
              onClick={() => onChange({ show_hints: !settings.show_hints })}
            >
              {settings.show_hints ? '💡 Pistas activadas' : '💡 Activar pistas'}
            </Button>
            <p style={{ fontSize: 12, color: '#6b7590', marginTop: 6 }}>
              Muestra ejemplos de palabras válidas durante la ronda (más fácil, menos reto).
            </p>
          </div>

          <Button variant="stop" style={{ width: '100%' }} onClick={onStart} disabled={needsMorePlayers}>
            Empezar partida
          </Button>
          {needsMorePlayers && (
            <p style={{ fontSize: 12, color: '#6b7590', marginTop: 8 }}>
              Con votación hacen falta al menos 2 jugadores. Invita a alguien o elige otro modo de validación.
            </p>
          )}
        </>
      ) : (
        <p>Esperando a que el anfitrión configure e inicie la partida…</p>
      )}
    </>
  );
}

// ---------------------------------------------------------------
// Ajuste numérico: se edita en local y se guarda al salir del campo (o con
// Enter), dentro de [min, max]. Antes cada tecla se guardaba tal cual y un
// campo vacío dejaba, p. ej., max_players = 0 y la sala bloqueada.
// ---------------------------------------------------------------
function NumberSetting({
  id,
  label,
  min,
  max,
  value,
  onCommit,
}: {
  id: string;
  label: string;
  min: number;
  max: number;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  function commit() {
    const n = Math.round(Number(text));
    const clamped = Number.isFinite(n) && text.trim() !== '' ? Math.min(max, Math.max(min, n)) : value;
    setText(String(clamped));
    if (clamped !== value) onCommit(clamped);
  }

  return (
    <div>
      <label className="field-label" htmlFor={id}>{label}</label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </div>
  );
}

// ---------------------------------------------------------------
// Selfie del jugador: se guarda sólo en este navegador (no se sube a
// ningún servidor) y se muestra junto a su propio resultado final.
// ---------------------------------------------------------------
function SelfiePicker({ gameType, code }: { gameType: string; code: string }) {
  const [selfie, setSelfie] = useState<string | null>(null);
  const [selfieError, setSelfieError] = useState('');

  useEffect(() => {
    setSelfie(getStoredSelfie(gameType, code));
  }, [gameType, code]);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelfieError('');
    try {
      const dataUrl = await shrinkSelfie(file);
      setSelfie(dataUrl);
      if (!storeSelfie(gameType, code, dataUrl)) {
        setSelfieError('Se verá ahora, pero este navegador no permite guardarla.');
      }
    } catch {
      setSelfieError('No se pudo leer esa imagen. Prueba con otra.');
    }
  }

  return (
    <div className="row" style={{ alignItems: 'center', gap: 12, marginBottom: 18 }}>
      {selfie ? (
        <img
          src={selfie}
          alt="Tu selfie"
          style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }}
        />
      ) : (
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#e8eaf2' }} />
      )}
      <div>
        <span className="field-label">Tu selfie (solo en este dispositivo)</span>
        <Input type="file" accept="image/*" capture="user" onChange={onFile} />
        {selfieError && <p style={{ fontSize: 12, color: 'var(--stamp-red)', marginTop: 4 }}>{selfieError}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Tablero de juego: letra, temporizador y categorías
// ---------------------------------------------------------------
function GameBoard({
  letter,
  categories,
  showHints,
  draft,
  onChange,
  onSave,
  secondsLeft,
  secondsTotal,
  onStop,
  animateReveal,
  sfx,
  saveStatus,
  players,
  answers,
  meId,
}: {
  letter: string;
  categories: string[];
  showHints: boolean;
  draft: Record<string, string>;
  onChange: (category: string, value: string) => void;
  onSave: () => void;
  secondsLeft: number | null;
  secondsTotal: number;
  onStop: () => void;
  animateReveal: boolean;
  sfx: SoundEffects;
  saveStatus: SaveStatus;
  players: Player[];
  answers: Answer[];
  meId: string | null;
}) {
  const [stopping, setStopping] = useState(false);
  const urgent = secondsLeft !== null && secondsLeft <= URGENT_FROM;
  const pct = secondsLeft !== null && secondsTotal > 0 ? Math.max(0, Math.min(100, (secondsLeft / secondsTotal) * 100)) : 100;
  const myFilled = categories.filter((c) => (draft[c] || '').trim()).length;
  const filledOf = (playerId: string) =>
    playerId === meId
      ? myFilled
      : answers.filter((a) => a.player_id === playerId && a.word.trim()).length;

  // Enter pasa a la siguiente categoría (en el móvil, la tecla "Siguiente")
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>, index: number) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const next = document.getElementById(`cat-${index + 1}`) as HTMLInputElement | null;
    if (next) next.focus();
    else (e.target as HTMLInputElement).blur();
  }

  async function stop() {
    setStopping(true);
    try {
      await onStop();
    } finally {
      setStopping(false);
    }
  }

  return (
    <>
      <div className="row" style={{ alignItems: 'center', marginBottom: 12 }}>
        <LetterReveal key={letter} letter={letter} animate={animateReveal} sfx={sfx} />
        <div style={{ textAlign: 'right' }}>
          <div className={urgent ? 'timer timer-urgent' : 'timer'} aria-live="off">
            {secondsLeft ?? '--'}s
          </div>
        </div>
      </div>

      <div
        className="timebar"
        role="progressbar"
        aria-label="Tiempo restante"
        aria-valuemin={0}
        aria-valuemax={secondsTotal}
        aria-valuenow={secondsLeft ?? secondsTotal}
      >
        <div className={urgent ? 'timebar-fill timebar-urgent' : 'timebar-fill'} style={{ width: `${pct}%` }} />
      </div>

      {players.length > 1 && (
        <div className="progress-chips" aria-label="Categorías rellenadas por jugador">
          {players.map((p) => (
            <span key={p.id} className={p.id === meId ? 'progress-chip progress-chip-me' : 'progress-chip'}>
              {p.id === meId ? 'Tú' : p.nickname} · {filledOf(p.id)}/{categories.length}
            </span>
          ))}
        </div>
      )}

      {showHints && <HintTicker letter={letter} categories={categories} />}

      {categories.map((cat, i) => (
        <div className="category-row" key={cat}>
          <label htmlFor={`cat-${i}`}>{cat}</label>
          <Input
            id={`cat-${i}`}
            value={draft[cat] || ''}
            onChange={(e) => onChange(cat, e.target.value)}
            onBlur={onSave}
            onKeyDown={(e) => onKeyDown(e, i)}
            enterKeyHint={i === categories.length - 1 ? 'done' : 'next'}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="words"
            spellCheck={false}
            maxLength={40}
          />
        </div>
      ))}

      <p className="save-status" aria-live="polite">
        {saveStatus === 'saving' && 'Guardando…'}
        {saveStatus === 'saved' && '✓ Respuestas guardadas'}
        {saveStatus === 'error' && 'No se pudo guardar. Se reintentará en unos segundos.'}
        {saveStatus === 'idle' && 'Tus respuestas se guardan solas mientras escribes.'}
      </p>

      <button
        onClick={stop}
        disabled={stopping}
        className="btn btn-stop stop-fab"
        aria-label="Terminar la ronda ahora"
      >
        ¡Stop!
      </button>
      <div style={{ height: 84 }} />
    </>
  );
}

// ---------------------------------------------------------------
// Letra de la ronda: si la ronda acaba de empezar, una ruleta de letras
// que se va frenando hasta caer en la sorteada (con sonido)
// ---------------------------------------------------------------
const REVEAL_LETTERS = 'ABCDEFGHIJLMNOPRSTUVZ';

function LetterReveal({ letter, animate, sfx }: { letter: string; animate: boolean; sfx: SoundEffects }) {
  const [shown, setShown] = useState(letter);
  const [landed, setLanded] = useState(!animate);

  useEffect(() => {
    if (!animate) {
      setShown(letter);
      setLanded(true);
      return;
    }
    if (prefersReducedMotion()) {
      setShown(letter);
      setLanded(true);
      sfx.letterLand();
      return;
    }
    const steps = 12;
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    setLanded(false);
    const step = () => {
      if (i >= steps) {
        setShown(letter);
        setLanded(true);
        sfx.letterLand();
        return;
      }
      const pool = REVEAL_LETTERS.replace(letter, '');
      setShown(pool[Math.floor(Math.random() * pool.length)]);
      sfx.letterTick();
      i++;
      timer = setTimeout(step, 50 + i * i * 1.5); // se va frenando
    };
    step();
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letter, animate]);

  return (
    <div
      className={landed ? 'letter-card letter-landed' : 'letter-card letter-spinning'}
      role="status"
      aria-label={landed ? `Letra de la ronda: ${letter}` : 'Sorteando la letra'}
    >
      {shown}
    </div>
  );
}

// ---------------------------------------------------------------
// Pista rotativa: muestra un ejemplo válido por categoría, aparece y
// desaparece cada ~2s (settings.show_hints). Si no hay ejemplo para
// alguna combinación categoría+letra, esa categoría se salta.
// ---------------------------------------------------------------
function HintTicker({ letter, categories }: { letter: string; categories: string[] }) {
  const [current, setCurrent] = useState<{ category: string; word: string } | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const withHints = categories
      .map((category) => ({ category, word: getHintWord(category, letter) }))
      .filter((x): x is { category: string; word: string } => !!x.word);

    if (withHints.length === 0) {
      setCurrent(null);
      return;
    }

    let index = 0;
    setCurrent(withHints[0]);
    setVisible(true);

    const showMs = 2000;
    const gapMs = 400;
    let showTimer: ReturnType<typeof setTimeout>;
    let hideTimer: ReturnType<typeof setTimeout>;

    function cycle() {
      showTimer = setTimeout(() => {
        setVisible(false);
        hideTimer = setTimeout(() => {
          index = (index + 1) % withHints.length;
          setCurrent(withHints[index]);
          setVisible(true);
          cycle();
        }, gapMs);
      }, showMs);
    }
    cycle();

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [letter, categories.join('|')]);

  if (!current) return null;

  return (
    <p
      style={{
        fontSize: 13,
        color: '#6b7590',
        marginBottom: 16,
        opacity: visible ? 1 : 0,
        transition: 'opacity 350ms ease',
      }}
    >
      💡 {current.category}: <strong>{current.word}</strong>
    </p>
  );
}

// ---------------------------------------------------------------
// Revisión de ronda: validación (según el modo elegido) + resolver
// ---------------------------------------------------------------
function RoundReview({
  answers,
  players,
  categories,
  validationMode,
  votes,
  me,
  onVote,
  onHostDecision,
  isHost,
  onResolve,
  onContinue,
  stoppedByName,
  sfx,
}: {
  answers: Answer[];
  players: Player[];
  categories: string[];
  validationMode: ValidationMode;
  votes: Vote[];
  me: Player | null;
  onVote: (answerId: string, valid: boolean) => void;
  onHostDecision: (answerId: string, valid: boolean) => void;
  isHost: boolean;
  onResolve: (force?: boolean) => void;
  onContinue: () => void;
  stoppedByName: string | null;
  sfx: SoundEffects;
}) {
  const myVote = (answerId: string) => votes.find((v) => v.answer_id === answerId && v.voter_id === me?.id)?.valid;
  const nameOf = (id: string) => players.find((p) => p.id === id)?.nickname || '—';
  const isResolved = answers.length > 0 && answers.every((a) => a.is_valid !== null && a.is_valid !== undefined);
  const readyToValidate = isRoundFullyValidated(answers, players, votes, validationMode);
  const pendingCount = answers.filter((a) => {
    if (!a.word.trim() || (a.is_valid !== null && a.is_valid !== undefined)) return false;
    if (validationMode === 'host') return true;
    if (validationMode === 'vote') {
      const eligibleVoters = players.filter((p) => p.id !== a.player_id).length;
      const voteCount = votes.filter((v) => v.answer_id === a.id).length;
      return voteCount < eligibleVoters;
    }
    return false;
  }).length;

  // sonido cuando se calculan los puntos (no al recargar una ronda ya resuelta)
  const wasResolvedRef = useRef(isResolved);
  useEffect(() => {
    if (isResolved && !wasResolvedRef.current) sfx.pointsChime();
    wasResolvedRef.current = isResolved;
  }, [isResolved, sfx]);

  const myRoundPoints = me ? answers.filter((a) => a.player_id === me.id).reduce((sum, a) => sum + (a.points || 0), 0) : 0;

  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <Stamp>{stoppedByName ? '¡STOP!' : '¡TIEMPO!'}</Stamp>
      </div>
      <p className="subtitle">
        {stoppedByName ? `${stoppedByName} cantó ¡Stop!` : 'Se acabó el tiempo.'} Revisión de la ronda.
      </p>

      {isResolved && me && (
        <div className="round-points" role="status">
          Tu ronda: <strong>+{myRoundPoints} pts</strong>
        </div>
      )}

      {categories.map((cat) => (
        <div key={cat} style={{ marginBottom: 16 }}>
          <span className="field-label">{cat}</span>
          {answers
            .filter((a) => a.category === cat)
            .map((a) => {
              const hasWord = a.word.trim().length > 0;
              const decided = a.is_valid !== null && a.is_valid !== undefined;
              const eligibleVoters = players.filter((p) => p.id !== a.player_id).length;
              const voteCount = votes.filter((v) => v.answer_id === a.id).length;

              let status: string | null = null;
              if (decided) {
                status = a.is_valid ? `✓ válida · +${a.points} pts` : '✗ no válida · 0 pts';
              } else if (hasWord && validationMode === 'vote') {
                status = `${voteCount}/${eligibleVoters} votos`;
              }

              const canVote = !decided && hasWord && validationMode === 'vote' && a.player_id !== me?.id;
              const canHostDecide = !decided && hasWord && validationMode === 'host' && isHost;

              return (
                <PlayerChip
                  key={a.id}
                  actions={
                    canVote ? (
                      <span className="row" style={{ gap: 6 }}>
                        <Button
                          variant={myVote(a.id) === true ? 'primary' : 'ghost'}
                          aria-pressed={myVote(a.id) === true}
                          style={{ fontSize: 12, padding: '6px 10px' }}
                          onClick={() => onVote(a.id, true)}
                        >
                          Válida
                        </Button>
                        <Button
                          variant={myVote(a.id) === false ? 'primary' : 'ghost'}
                          aria-pressed={myVote(a.id) === false}
                          style={{ fontSize: 12, padding: '6px 10px' }}
                          onClick={() => onVote(a.id, false)}
                        >
                          No válida
                        </Button>
                      </span>
                    ) : canHostDecide ? (
                      <span className="row" style={{ gap: 6 }}>
                        <Button variant="ghost" style={{ fontSize: 12, padding: '6px 10px' }} onClick={() => onHostDecision(a.id, true)}>
                          Válida
                        </Button>
                        <Button variant="ghost" style={{ fontSize: 12, padding: '6px 10px' }} onClick={() => onHostDecision(a.id, false)}>
                          No válida
                        </Button>
                      </span>
                    ) : undefined
                  }
                >
                  {nameOf(a.player_id)}: <strong>{a.word || '(vacío)'}</strong>
                  {status && <span style={{ marginLeft: 8, fontSize: 12, color: '#6b7590' }}>{status}</span>}
                </PlayerChip>
              );
            })}
        </div>
      ))}

      {isHost && !isResolved && (
        <>
          <Button variant="primary" style={{ width: '100%' }} onClick={() => onResolve()} disabled={!readyToValidate}>
            Validar y calcular puntos
          </Button>
          {!readyToValidate && (
            <>
              <p style={{ fontSize: 12, color: '#6b7590', marginTop: 8 }}>
                Faltan {pendingCount} respuesta{pendingCount === 1 ? '' : 's'} por validar.
              </p>
              <Button variant="ghost" style={{ width: '100%', marginTop: 10, fontSize: 13 }} onClick={() => onResolve(true)}>
                {validationMode === 'vote' ? 'Cerrar la votación ya' : 'Dar el resto por válidas'}
              </Button>
              <p style={{ fontSize: 12, color: '#6b7590', marginTop: 6 }}>
                {validationMode === 'vote'
                  ? 'Decide con los votos emitidos. Las palabras sin ningún voto cuentan como válidas.'
                  : 'Las palabras que no marcaste cuentan como válidas.'}
              </p>
            </>
          )}
        </>
      )}

      {isHost && isResolved && (
        <Button variant="stop" style={{ width: '100%' }} onClick={onContinue}>
          Continuar
        </Button>
      )}
    </>
  );
}

// ---------------------------------------------------------------
// Marcador entre rondas
// ---------------------------------------------------------------
function RoundScoreboard({
  players,
  currentRound,
  totalRounds,
  isHost,
  onNext,
  answers,
  meId,
}: {
  players: Player[];
  currentRound: number;
  totalRounds: number;
  isHost: boolean;
  onNext: () => void;
  answers: Answer[];
  meId: string | null;
}) {
  const sorted = [...players].sort((a, b) => b.total_score - a.total_score);
  // puntos de la ronda que acaba de terminar y cambio de puesto
  const gained = (id: string) => answers.filter((a) => a.player_id === id).reduce((sum, a) => sum + (a.points || 0), 0);
  const before = [...players].sort((a, b) => b.total_score - gained(b.id) - (a.total_score - gained(a.id)));
  const movement = (id: string, nowIndex: number) => {
    const prevIndex = before.findIndex((p) => p.id === id);
    if (currentRound <= 1 || prevIndex === nowIndex) return null;
    return prevIndex > nowIndex ? (
      <span className="move move-up" aria-label={`sube ${prevIndex - nowIndex}`}>▲{prevIndex - nowIndex}</span>
    ) : (
      <span className="move move-down" aria-label={`baja ${nowIndex - prevIndex}`}>▼{nowIndex - prevIndex}</span>
    );
  };
  const leader = sorted[0];
  return (
    <>
      <p className="subtitle">
        Ronda {currentRound} de {totalRounds} completada.
      </p>
      {leader && leader.total_score > 0 && (
        <p style={{ marginTop: -16, marginBottom: 16, fontSize: 14 }}>
          {leader.id === meId ? '🏆 Vas en cabeza.' : `🏆 Va en cabeza ${leader.nickname}.`}
          {currentRound + 1 === totalRounds && ' ¡Queda la última ronda!'}
        </p>
      )}
      <ScoreTable
        headers={['#', 'Jugador', 'Ronda', 'Total']}
        rows={sorted.map((p, i) => ({
          key: p.id,
          cells: [
            <>
              {i + 1} {movement(p.id, i)}
            </>,
            p.id === meId ? <strong>{p.nickname} (tú)</strong> : p.nickname,
            <span className="gain">+{gained(p.id)}</span>,
            <strong>{p.total_score}</strong>,
          ],
        }))}
      />
      {isHost ? (
        <Button variant="stop" style={{ width: '100%', marginTop: 20 }} onClick={onNext}>
          {currentRound + 1 === totalRounds ? 'Última ronda' : 'Siguiente ronda'}
        </Button>
      ) : (
        <p style={{ marginTop: 16, fontSize: 13, color: '#6b7590' }}>Esperando a que el anfitrión empiece la siguiente ronda…</p>
      )}
    </>
  );
}

// ---------------------------------------------------------------
// Resultado final
// ---------------------------------------------------------------
function FinalResults({ players, me, code }: { players: Player[]; me: Player | null; code: string }) {
  const sorted = [...players].sort((a, b) => b.total_score - a.total_score);
  const mySelfie = getStoredSelfie(GAME_TYPE, code);
  const rest = sorted.slice(3);

  const renderAvatar = (p: { id: string; nickname: string }) =>
    p.id === me?.id && mySelfie ? (
      <img
        src={mySelfie}
        alt={p.nickname}
        style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }}
      />
    ) : (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: '#e8eaf2',
          fontSize: 16,
        }}
      >
        {p.nickname.charAt(0).toUpperCase()}
      </span>
    );

  const iWon = !!me && sorted[0]?.id === me.id;

  return (
    <>
      <Confetti />
      <div style={{ marginBottom: 18 }}>
        <Stamp>FIN DE LA PARTIDA</Stamp>
      </div>
      {me && (
        <p className="subtitle">
          {iWon ? '¡Has ganado! 🎉' : `Has quedado en el puesto ${sorted.findIndex((p) => p.id === me.id) + 1} de ${sorted.length}.`}
        </p>
      )}

      <Podium players={sorted} renderAvatar={renderAvatar} />

      {rest.length > 0 && (
        <ScoreTable
          headers={['#', 'Jugador', 'Puntos']}
          rows={rest.map((p, i) => ({ key: p.id, cells: [i + 4, p.nickname, p.total_score] }))}
        />
      )}

      <p style={{ marginTop: 16 }}>
        <a href="/ranking?game=stop" style={{ color: 'var(--ink-blue)' }}>Ver el ranking de ¡Stop! →</a>
      </p>
      <p style={{ marginTop: 8 }}>
        <a href="/juegos/stop" style={{ color: 'var(--ink-blue)' }}>Jugar otra partida</a>
      </p>
    </>
  );
}

// ---------------------------------------------------------------
// Confeti del final: piezas de CSS que caen una vez (sin librerías). Se
// omite si el sistema pide reducir el movimiento.
// ---------------------------------------------------------------
const CONFETTI_COLORS = ['var(--stamp-red)', 'var(--highlight)', 'var(--ink-blue)', '#3fa36b', '#e57fb0'];

function Confetti() {
  const [pieces, setPieces] = useState<
    { left: number; delay: number; duration: number; color: string; rotate: number; size: number }[]
  >([]);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    setPieces(
      Array.from({ length: 70 }, () => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.8,
        duration: 2.2 + Math.random() * 1.6,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        rotate: Math.random() * 360,
        size: 6 + Math.random() * 6,
      }))
    );
    const t = setTimeout(() => setPieces([]), 4800);
    return () => clearTimeout(t);
  }, []);

  if (pieces.length === 0) return null;
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.45,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}
