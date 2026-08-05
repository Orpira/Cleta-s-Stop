'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase, Room, Player, Answer, RoomSettings, ValidationMode } from '../../../lib/supabaseClient';
import { drawRandomLetter, scoreRound, tallyVotes } from '../../../lib/gameLogic';

export default function SalaPage() {
  const params = useParams<{ codigo: string }>();
  const code = (params.codigo || '').toUpperCase();

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [error, setError] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const me = players.find((p) => p.id === myPlayerId) || null;
  const isHost = !!me?.is_host;

  // --- carga inicial + suscripción en tiempo real ---
  useEffect(() => {
    if (!code) return;
    const pid = localStorage.getItem(`stop_player_${code}`);
    setMyPlayerId(pid);

    (async () => {
      const { data: r } = await supabase.from('rooms').select('*').eq('code', code).single();
      if (!r) {
        setError('Esta sala no existe o ya terminó.');
        return;
      }
      setRoom(r as Room);
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
      }
    })();
  }, [code]);

  useEffect(() => {
    if (!room?.id) return;

    const channel = supabase
      .channel(`room-${room.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}` }, (payload) => {
        setRoom(payload.new as Room);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${room.id}` }, async () => {
        const { data: pls } = await supabase.from('players').select('*').eq('room_id', room.id).order('joined_at');
        setPlayers((pls as Player[]) || []);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'rounds', filter: `room_id=eq.${room.id}` }, (payload) => {
        setRoundId(payload.new.id as string);
        setAnswers([]);
        setDraft({});
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'answers' }, async (payload) => {
        const rId = (payload.new as any)?.round_id || (payload.old as any)?.round_id;
        if (rId && rId === roundId) {
          const { data } = await supabase.from('answers').select('*').eq('round_id', rId);
          setAnswers((data as Answer[]) || []);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id, roundId]);

  // --- temporizador local de la ronda ---
  useEffect(() => {
    if (room?.status === 'playing' && roundId) {
      setSecondsLeft(room.settings.round_seconds);
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

  // --- acciones del host: configuración ---
  async function updateSettings(patch: Partial<RoomSettings>) {
    if (!room) return;
    const settings = { ...room.settings, ...patch };
    await supabase.from('rooms').update({ settings }).eq('id', room.id);
  }

  async function startGame() {
    if (!room) return;
    const letter = drawRandomLetter();
    const { data: newRound } = await supabase
      .from('rounds')
      .insert({ room_id: room.id, round_number: 1, letter })
      .select()
      .single();
    await supabase
      .from('rooms')
      .update({ status: 'playing', current_round: 1, current_letter: letter })
      .eq('id', room.id);
    setRoundId(newRound?.id || null);
  }

  async function endRound() {
    if (!room || !roundId) return;
    await supabase.from('rounds').update({ ended_at: new Date().toISOString() }).eq('id', roundId);
    await supabase.from('rooms').update({ status: 'round_review' }).eq('id', room.id);
  }

  async function saveMyAnswers() {
    if (!room || !roundId || !me) return;
    const rows = room.settings.categories.map((category) => ({
      round_id: roundId,
      player_id: me.id,
      category,
      word: draft[category] || '',
    }));
    await supabase.from('answers').upsert(rows, { onConflict: 'round_id,player_id,category' });
  }

  // --- validación + puntuación (host resuelve y aplica) ---
  async function resolveRoundScores() {
    if (!room || !roundId) return;
    const { data: allAnswers } = await supabase.from('answers').select('*').eq('round_id', roundId);
    if (!allAnswers) return;

    let resolved = allAnswers as Answer[];

    if (room.settings.validation_mode === 'vote') {
      const { data: votes } = await supabase.from('validation_votes').select('*');
      resolved = resolved.map((a) => {
        const answerVotes = (votes || []).filter((v: any) => v.answer_id === a.id);
        const eligibleVoters = players.length - 1; // todos menos el autor de la respuesta
        const valid = tallyVotes(answerVotes, eligibleVoters);
        return { ...a, is_valid: valid };
      });
    }

    const scored = scoreRound(resolved, room.current_letter || '', room.settings);

    for (const a of scored) {
      await supabase.from('answers').update({ is_valid: a.is_valid, points: a.points }).eq('id', a.id);
    }

    for (const p of players) {
      const gained = scored.filter((a) => a.player_id === p.id).reduce((sum, a) => sum + a.points, 0);
      await supabase.from('players').update({ total_score: p.total_score + gained }).eq('id', p.id);
    }

    const isLastRound = room.current_round >= room.settings.rounds_to_play;
    if (isLastRound) {
      await finishGame();
    } else {
      await supabase.from('rooms').update({ status: 'lobby' }).eq('id', room.id);
    }
  }

  async function nextRound() {
    if (!room) return;
    const letter = drawRandomLetter();
    const nextNumber = room.current_round + 1;
    const { data: newRound } = await supabase
      .from('rounds')
      .insert({ room_id: room.id, round_number: nextNumber, letter })
      .select()
      .single();
    await supabase
      .from('rooms')
      .update({ status: 'playing', current_round: nextNumber, current_letter: letter })
      .eq('id', room.id);
    setRoundId(newRound?.id || null);
  }

  async function finishGame() {
    if (!room) return;
    await supabase.from('rooms').update({ status: 'finished' }).eq('id', room.id);
    for (const p of players) {
      const { data: existing } = await supabase
        .from('leaderboard')
        .select('*')
        .eq('nickname', p.nickname)
        .maybeSingle();
      if (existing) {
        await supabase
          .from('leaderboard')
          .update({
            best_score: Math.max(existing.best_score, p.total_score),
            games_played: existing.games_played + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        await supabase.from('leaderboard').insert({ nickname: p.nickname, best_score: p.total_score, games_played: 1 });
      }
    }
  }

  async function castVote(answerId: string, valid: boolean) {
    if (!me) return;
    await supabase.from('validation_votes').upsert(
      { answer_id: answerId, voter_id: me.id, valid },
      { onConflict: 'answer_id,voter_id' }
    );
  }

  if (error) {
    return (
      <div className="page">
        <div className="sheet">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="page">
        <div className="sheet">
          <p>Cargando sala…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="sheet" style={{ maxWidth: 640 }}>
        <div className="brand">orpira.es · sala</div>
        <div className="row" style={{ alignItems: 'baseline', marginBottom: 8 }}>
          <h1 className="title" style={{ fontSize: 34 }}>¡Stop!</h1>
          <span className="code-display">{room.code}</span>
        </div>

        {room.status === 'lobby' && room.current_round === 0 && (
          <LobbySettings
            settings={room.settings}
            isHost={isHost}
            players={players}
            onChange={updateSettings}
            onStart={startGame}
          />
        )}

        {room.status === 'lobby' && room.current_round > 0 && (
          <RoundScoreboard
            players={players}
            currentRound={room.current_round}
            totalRounds={room.settings.rounds_to_play}
            isHost={isHost}
            onNext={nextRound}
          />
        )}

        {room.status === 'playing' && (
          <GameBoard
            letter={room.current_letter || ''}
            categories={room.settings.categories}
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
            categories={room.settings.categories}
            validationMode={room.settings.validation_mode}
            me={me}
            onVote={castVote}
            isHost={isHost}
            onResolve={resolveRoundScores}
          />
        )}

        {room.status === 'finished' && <FinalResults players={players} />}
      </div>
    </div>
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
}: {
  settings: RoomSettings;
  isHost: boolean;
  players: Player[];
  onChange: (patch: Partial<RoomSettings>) => void;
  onStart: () => void;
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
          <div className="player-chip" key={p.id}>
            <span>{p.nickname}{p.is_host ? ' · anfitrión' : ''}</span>
          </div>
        ))}
      </div>

      {isHost ? (
        <>
          <div style={{ marginBottom: 18 }}>
            <span className="field-label">Cómo se validan las palabras</span>
            <div className="row">
              {validationOptions.map((opt) => (
                <button
                  key={opt.value}
                  className={settings.validation_mode === opt.value ? 'btn btn-primary' : 'btn btn-ghost'}
                  style={{ fontSize: 13 }}
                  onClick={() => onChange({ validation_mode: opt.value })}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="row" style={{ marginBottom: 18 }}>
            <div>
              <span className="field-label">Máx. de jugadores</span>
              <input
                className="input"
                type="number"
                min={2}
                max={30}
                value={settings.max_players}
                onChange={(e) => onChange({ max_players: Number(e.target.value) })}
              />
            </div>
            <div>
              <span className="field-label">Segundos por ronda</span>
              <input
                className="input"
                type="number"
                min={15}
                max={180}
                value={settings.round_seconds}
                onChange={(e) => onChange({ round_seconds: Number(e.target.value) })}
              />
            </div>
            <div>
              <span className="field-label">Nº de rondas</span>
              <input
                className="input"
                type="number"
                min={1}
                max={20}
                value={settings.rounds_to_play}
                onChange={(e) => onChange({ rounds_to_play: Number(e.target.value) })}
              />
            </div>
          </div>

          <button className="btn btn-stop" style={{ width: '100%' }} onClick={onStart} disabled={players.length < 1}>
            Empezar partida
          </button>
        </>
      ) : (
        <p>Esperando a que el anfitrión configure e inicie la partida…</p>
      )}
    </>
  );
}

// ---------------------------------------------------------------
// Tablero de juego: letra, temporizador y categorías
// ---------------------------------------------------------------
function GameBoard({
  letter,
  categories,
  draft,
  setDraft,
  secondsLeft,
  onSave,
  isHost,
  onStop,
}: {
  letter: string;
  categories: string[];
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
            <button className="btn btn-stop" onClick={onStop}>
              ¡Stop!
            </button>
          )}
        </div>
      </div>

      {categories.map((cat) => (
        <div className="category-row" key={cat}>
          <label>{cat}</label>
          <input
            className="input"
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
// Revisión de ronda: validación (según el modo elegido) + resolver
// ---------------------------------------------------------------
function RoundReview({
  answers,
  players,
  categories,
  validationMode,
  me,
  onVote,
  isHost,
  onResolve,
}: {
  answers: Answer[];
  players: Player[];
  categories: string[];
  validationMode: ValidationMode;
  me: Player | null;
  onVote: (answerId: string, valid: boolean) => void;
  isHost: boolean;
  onResolve: () => void;
}) {
  const nameOf = (id: string) => players.find((p) => p.id === id)?.nickname || '—';

  return (
    <>
      <div className="stamp" style={{ marginBottom: 18 }}>¡STOP!</div>
      <p className="subtitle">Revisión de la ronda.</p>

      {categories.map((cat) => (
        <div key={cat} style={{ marginBottom: 16 }}>
          <span className="field-label">{cat}</span>
          {answers
            .filter((a) => a.category === cat)
            .map((a) => (
              <div className="player-chip" key={a.id}>
                <span>
                  {nameOf(a.player_id)}: <strong>{a.word || '(vacío)'}</strong>
                </span>
                {validationMode === 'vote' && a.player_id !== me?.id && (
                  <span className="row" style={{ gap: 6 }}>
                    <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 10px' }} onClick={() => onVote(a.id, true)}>
                      Válida
                    </button>
                    <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 10px' }} onClick={() => onVote(a.id, false)}>
                      No válida
                    </button>
                  </span>
                )}
              </div>
            ))}
        </div>
      ))}

      {isHost && (
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={onResolve}>
          Calcular puntos y continuar
        </button>
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
      <table className="scores">
        <thead>
          <tr>
            <th>#</th>
            <th>Jugador</th>
            <th>Puntos</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => (
            <tr key={p.id}>
              <td>{i + 1}</td>
              <td>{p.nickname}</td>
              <td>{p.total_score}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {isHost && (
        <button className="btn btn-stop" style={{ width: '100%', marginTop: 20 }} onClick={onNext}>
          Siguiente ronda
        </button>
      )}
    </>
  );
}

// ---------------------------------------------------------------
// Resultado final
// ---------------------------------------------------------------
function FinalResults({ players }: { players: Player[] }) {
  const sorted = [...players].sort((a, b) => b.total_score - a.total_score);
  return (
    <>
      <div className="stamp" style={{ marginBottom: 18 }}>FIN DE LA PARTIDA</div>
      <table className="scores">
        <thead>
          <tr>
            <th>#</th>
            <th>Jugador</th>
            <th>Puntos</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => (
            <tr key={p.id}>
              <td>{i + 1}</td>
              <td>{p.nickname}</td>
              <td>{p.total_score}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginTop: 16 }}>
        <a href="/ranking" style={{ color: 'var(--ink-blue)' }}>Ver ranking global (top 5) →</a>
      </p>
      <p style={{ marginTop: 8 }}>
        <a href="/" style={{ color: 'var(--ink-blue)' }}>Jugar otra partida</a>
      </p>
    </>
  );
}
