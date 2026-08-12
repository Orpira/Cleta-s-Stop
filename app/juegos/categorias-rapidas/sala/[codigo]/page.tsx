'use client';

import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase, Player } from '@/lib/core/supabaseClient';
import { getStoredPlayerId } from '@/lib/core/roomActions';
import { applyRoundScores, upsertLeaderboardResult } from '@/lib/core/scoring';
import {
  drawRandomLetter,
  tallyVotes,
  isRoundFullyValidated,
  Answer,
  Vote,
  ValidationMode,
  scoreRound,
} from '@/lib/games/shared/wordGameLogic';
import { getRecentLetters, rememberLetter } from '@/lib/games/shared/letterHistory';
import { getHintWord } from '@/lib/games/shared/wordBank';
import { createRoundMusic } from '@/lib/games/shared/roundMusic';
import { getStoredSelfie, storeSelfie } from '@/lib/games/shared/selfieStorage';
import {
  CategoriasRoom,
  CategoriasSettings,
  CATEGORY_POOL,
  drawRandomCategories,
} from '@/lib/games/categorias-rapidas/gameLogic';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PlayerChip } from '@/components/ui/PlayerChip';
import { ScoreTable } from '@/components/ui/ScoreTable';
import { Stamp } from '@/components/ui/Stamp';

const GAME_TYPE = 'categorias-rapidas';

export default function CategoriasRapidasRoomPage() {
  const params = useParams<{ codigo: string }>();
  const code = (params.codigo || '').toUpperCase();

  const [room, setRoom] = useState<CategoriasRoom | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [roundCategories, setRoundCategories] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [error, setError] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const roundIdRef = useRef<string | null>(null);
  roundIdRef.current = roundId;
  const answersRef = useRef<Answer[]>([]);
  answersRef.current = answers;
  const resolvingRef = useRef(false);
  const musicRef = useRef(createRoundMusic());
  const [musicEnabled, setMusicEnabled] = useState(false);

  const me = players.find((p) => p.id === myPlayerId) || null;
  const isHost = !!me?.is_host;
  const settings = (room?.settings || {}) as CategoriasSettings;

  // --- carga inicial + suscripción en tiempo real ---
  useEffect(() => {
    if (!code) return;
    setMyPlayerId(getStoredPlayerId(GAME_TYPE, code));

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
      setRoom(r as CategoriasRoom);
      const { data: pls } = await supabase.from('players').select('*').eq('room_id', r.id).order('joined_at');
      setPlayers((pls as Player[]) || []);

      const { data: latestRound } = await supabase
        .from('rounds')
        .select('*')
        .eq('room_id', r.id)
        .order('round_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestRound && !latestRound.ended_at) {
        setRoundId(latestRound.id);
        setRoundCategories(latestRound.payload?.categories || []);
      }
    })();
  }, [code]);

  useEffect(() => {
    if (!room?.id) return;

    const channel = supabase
      .channel(`room-${room.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}` }, (payload) => {
        setRoom(payload.new as CategoriasRoom);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${room.id}` }, async () => {
        const { data: pls } = await supabase.from('players').select('*').eq('room_id', room.id).order('joined_at');
        setPlayers((pls as Player[]) || []);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rounds', filter: `room_id=eq.${room.id}` }, (payload) => {
        setRoundId(payload.new.id as string);
        setRoundCategories((payload.new as any).payload?.categories || []);
        setAnswers([]);
        setVotes([]);
        setDraft({});
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'answers' }, async (payload) => {
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id]);

  // --- temporizador local de la ronda ---
  useEffect(() => {
    if (room?.status === 'playing' && roundId) {
      setSecondsLeft(settings.round_seconds);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s === null) return null;
          if (s <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            if (isHost) endRound();
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.status, roundId]);

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

  // --- acciones del host: configuración ---
  async function updateSettings(patch: Partial<CategoriasSettings>) {
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

  async function startGame() {
    if (!room) return;
    const letter = await pickRoundLetter();
    const categories = drawRandomCategories(settings.categories_per_round);
    const { data: newRound } = await supabase
      .from('rounds')
      .insert({ room_id: room.id, round_number: 1, letter, payload: { categories } })
      .select()
      .single();
    await supabase
      .from('rooms')
      .update({ status: 'playing', current_round: 1, current_letter: letter })
      .eq('id', room.id);
    setRoundId(newRound?.id || null);
    setRoundCategories(categories);
  }

  async function endRound() {
    if (!room || !roundId) return;
    await supabase.from('rounds').update({ ended_at: new Date().toISOString() }).eq('id', roundId);
    await supabase.from('rooms').update({ status: 'round_review' }).eq('id', room.id);
  }

  async function saveMyAnswers() {
    if (!room || !roundId || !me) return;
    const rows = roundCategories.map((category) => ({
      round_id: roundId,
      player_id: me.id,
      category,
      word: draft[category] || '',
    }));
    await supabase.from('answers').upsert(rows, { onConflict: 'round_id,player_id,category' });
  }

  // --- validación + puntuación (host resuelve; sólo se permite cuando ya
  // todas las respuestas están validadas, ver isRoundFullyValidated) ---
  async function resolveRoundScores() {
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
          const eligibleVoters = players.length - 1; // todos menos el autor de la respuesta
          const valid = tallyVotes(answerVotes, eligibleVoters);
          return { ...a, is_valid: valid };
        });
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

  async function nextRound() {
    if (!room) return;
    const letter = await pickRoundLetter();
    const categories = drawRandomCategories(settings.categories_per_round);
    const nextNumber = room.current_round + 1;
    const { data: newRound } = await supabase
      .from('rounds')
      .insert({ room_id: room.id, round_number: nextNumber, letter, payload: { categories } })
      .select()
      .single();
    await supabase
      .from('rooms')
      .update({ status: 'playing', current_round: nextNumber, current_letter: letter })
      .eq('id', room.id);
    setRoundId(newRound?.id || null);
    setRoundCategories(categories);
  }

  async function finishGame() {
    if (!room) return;
    await supabase.from('rooms').update({ status: 'finished' }).eq('id', room.id);
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
      </Sheet>
    );
  }

  if (!room) {
    return (
      <Sheet brand="orpira.es · sala">
        <p>Cargando sala…</p>
      </Sheet>
    );
  }

  return (
    <Sheet brand="orpira.es · sala" maxWidth={640}>
      <div className="row" style={{ alignItems: 'baseline', marginBottom: 8 }}>
        <h1 className="title" style={{ fontSize: 34 }}>Categorías rápidas</h1>
        <span className="code-display">{room.code}</span>
        <Button variant="ghost" style={{ fontSize: 12, padding: '6px 10px', flex: '0 0 auto' }} onClick={toggleMusic}>
          {musicEnabled ? '🔊 Música' : '🔇 Música'}
        </Button>
      </div>

      {room.status === 'lobby' && room.current_round === 0 && (
        <LobbySettings
          settings={settings}
          isHost={isHost}
          players={players}
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
        />
      )}

      {room.status === 'playing' && (
        <GameBoard
          letter={room.current_letter || ''}
          categories={roundCategories}
          showHints={settings.show_hints}
          draft={draft}
          setDraft={setDraft}
          secondsLeft={secondsLeft}
          onSave={saveMyAnswers}
          isHost={isHost}
          onStop={endRound}
        />
      )}

      {room.status === 'round_review' && (
        <RoundReview
          answers={answers}
          players={players}
          categories={roundCategories}
          validationMode={settings.validation_mode}
          votes={votes}
          me={me}
          onVote={castVote}
          onHostDecision={castHostDecision}
          isHost={isHost}
          onResolve={resolveRoundScores}
          onContinue={continueAfterReview}
        />
      )}

      {room.status === 'finished' && <FinalResults players={players} me={me} code={code} />}
    </Sheet>
  );
}

// ---------------------------------------------------------------
// Lobby: aquí los propios participantes configuran la partida
// ---------------------------------------------------------------
function LobbySettings({
  settings,
  isHost,
  players,
  onChange,
  onStart,
  code,
}: {
  settings: CategoriasSettings;
  isHost: boolean;
  players: Player[];
  onChange: (patch: Partial<CategoriasSettings>) => void;
  onStart: () => void;
  code: string;
}) {
  const validationOptions: { value: ValidationMode; label: string }[] = [
    { value: 'vote', label: 'Votación entre jugadores' },
    { value: 'host', label: 'El anfitrión decide' },
    { value: 'auto_nonempty', label: 'Automático (empieza por la letra)' },
  ];

  return (
    <>
      <p className="subtitle">Comparte el código con tus amigos. Configura la partida antes de empezar.</p>

      <div style={{ marginBottom: 20 }}>
        <span className="field-label">Jugadores conectados ({players.length}/{settings.max_players})</span>
        {players.map((p) => (
          <PlayerChip key={p.id}>
            {p.nickname}
            {p.is_host ? ' · anfitrión' : ''}
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
            <div>
              <span className="field-label">Máx. de jugadores</span>
              <Input
                type="number"
                min={2}
                max={30}
                value={settings.max_players}
                onChange={(e) => onChange({ max_players: Number(e.target.value) })}
              />
            </div>
            <div>
              <span className="field-label">Segundos por ronda</span>
              <Input
                type="number"
                min={15}
                max={180}
                value={settings.round_seconds}
                onChange={(e) => onChange({ round_seconds: Number(e.target.value) })}
              />
            </div>
            <div>
              <span className="field-label">Nº de rondas</span>
              <Input
                type="number"
                min={1}
                max={20}
                value={settings.rounds_to_play}
                onChange={(e) => onChange({ rounds_to_play: Number(e.target.value) })}
              />
            </div>
            <div>
              <span className="field-label">Categorías por ronda</span>
              <Input
                type="number"
                min={1}
                max={CATEGORY_POOL.length}
                value={settings.categories_per_round}
                onChange={(e) => onChange({ categories_per_round: Number(e.target.value) })}
              />
            </div>
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

          <Button variant="stop" style={{ width: '100%' }} onClick={onStart} disabled={players.length < 1}>
            Empezar partida
          </Button>
        </>
      ) : (
        <p>Esperando a que el anfitrión configure e inicie la partida…</p>
      )}
    </>
  );
}

// ---------------------------------------------------------------
// Selfie del jugador: se guarda sólo en este navegador (no se sube a
// ningún servidor) y se muestra junto a su propio resultado final.
// ---------------------------------------------------------------
function SelfiePicker({ gameType, code }: { gameType: string; code: string }) {
  const [selfie, setSelfie] = useState<string | null>(null);

  useEffect(() => {
    setSelfie(getStoredSelfie(gameType, code));
  }, [gameType, code]);

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      storeSelfie(gameType, code, dataUrl);
      setSelfie(dataUrl);
    };
    reader.readAsDataURL(file);
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
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Tablero de juego: letra, temporizador y categorías sorteadas de la ronda
// ---------------------------------------------------------------
function GameBoard({
  letter,
  categories,
  showHints,
  draft,
  setDraft,
  secondsLeft,
  onSave,
  isHost,
  onStop,
}: {
  letter: string;
  categories: string[];
  showHints: boolean;
  draft: Record<string, string>;
  setDraft: (d: Record<string, string>) => void;
  secondsLeft: number | null;
  onSave: () => void;
  isHost: boolean;
  onStop: () => void;
}) {
  return (
    <>
      <div className="row" style={{ alignItems: 'center', marginBottom: 24 }}>
        <div className="letter-card">{letter}</div>
        <div style={{ textAlign: 'right' }}>
          <div className="timer">{secondsLeft ?? '--'}s</div>
          {isHost && (
            <Button variant="stop" onClick={onStop}>
              ¡Stop!
            </Button>
          )}
        </div>
      </div>

      {showHints && <HintTicker letter={letter} categories={categories} />}

      {categories.map((cat) => (
        <div className="category-row" key={cat}>
          <label>{cat}</label>
          <Input
            value={draft[cat] || ''}
            onChange={(e) => setDraft({ ...draft, [cat]: e.target.value })}
            onBlur={onSave}
          />
        </div>
      ))}

      <p style={{ fontSize: 12, color: '#6b7590', marginTop: 16 }}>
        Tus respuestas se guardan automáticamente mientras escribes.
      </p>
    </>
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
  onResolve: () => void;
  onContinue: () => void;
}) {
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

  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <Stamp>¡STOP!</Stamp>
      </div>
      <p className="subtitle">Revisión de la ronda.</p>

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
                        <Button variant="ghost" style={{ fontSize: 12, padding: '6px 10px' }} onClick={() => onVote(a.id, true)}>
                          Válida
                        </Button>
                        <Button variant="ghost" style={{ fontSize: 12, padding: '6px 10px' }} onClick={() => onVote(a.id, false)}>
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
          <Button variant="primary" style={{ width: '100%' }} onClick={onResolve} disabled={!readyToValidate}>
            Validar y calcular puntos
          </Button>
          {!readyToValidate && (
            <p style={{ fontSize: 12, color: '#6b7590', marginTop: 8 }}>
              Faltan {pendingCount} respuesta{pendingCount === 1 ? '' : 's'} por validar.
            </p>
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
}: {
  players: Player[];
  currentRound: number;
  totalRounds: number;
  isHost: boolean;
  onNext: () => void;
}) {
  const sorted = [...players].sort((a, b) => b.total_score - a.total_score);
  return (
    <>
      <p className="subtitle">
        Ronda {currentRound} de {totalRounds} completada.
      </p>
      <ScoreTable
        headers={['#', 'Jugador', 'Puntos']}
        rows={sorted.map((p, i) => ({ key: p.id, cells: [i + 1, p.nickname, p.total_score] }))}
      />
      {isHost && (
        <Button variant="stop" style={{ width: '100%', marginTop: 20 }} onClick={onNext}>
          Siguiente ronda
        </Button>
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

  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <Stamp>FIN DE LA PARTIDA</Stamp>
      </div>
      <ScoreTable
        headers={['', '#', 'Jugador', 'Puntos']}
        rows={sorted.map((p, i) => ({
          key: p.id,
          cells: [
            p.id === me?.id && mySelfie ? (
              <img
                src={mySelfie}
                alt={p.nickname}
                style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }}
              />
            ) : (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: '#e8eaf2',
                  fontSize: 12,
                }}
              >
                {p.nickname.charAt(0).toUpperCase()}
              </span>
            ),
            i + 1,
            p.nickname,
            p.total_score,
          ],
        }))}
      />
      <p style={{ marginTop: 16 }}>
        <a href="/ranking?game=categorias-rapidas" style={{ color: 'var(--ink-blue)' }}>Ver ranking global (top 5) →</a>
      </p>
      <p style={{ marginTop: 8 }}>
        <a href="/juegos/categorias-rapidas" style={{ color: 'var(--ink-blue)' }}>Jugar otra partida</a>
      </p>
    </>
  );
}
