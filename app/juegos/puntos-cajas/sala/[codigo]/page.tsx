'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase, Player, Room } from '@/lib/core/supabaseClient';
import { getStoredPlayerId } from '@/lib/core/roomActions';
import {
  drawLine,
  passTurn,
  isBoardFull,
  getWinner,
  PuntosCajasBoardState,
  PuntosCajasRound,
  horizontalLineCoords,
  verticalLineCoords,
  TURN_SECONDS,
} from '@/lib/games/puntos-cajas/gameLogic';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PlayerChip } from '@/components/ui/PlayerChip';
import { ScoreTable } from '@/components/ui/ScoreTable';
import { Stamp } from '@/components/ui/Stamp';

const GAME_TYPE = 'puntos-cajas';

// Un color distinto por posición en turn_order (hasta 4 jugadores).
const PLAYER_COLORS = ['#4A90E2', '#E24A6B', '#3FBF7F', '#E2A64A'];

function colorForPlayer(turnOrder: string[], playerId: string | null): string {
  if (!playerId) return '#C0C0C0';
  const idx = turnOrder.indexOf(playerId);
  return idx >= 0 ? PLAYER_COLORS[idx % PLAYER_COLORS.length] : '#C0C0C0';
}

export default function PuntosCajasRoomPage() {
  const params = useParams<{ codigo: string }>();
  const code = (params.codigo || '').toUpperCase();

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [round, setRound] = useState<PuntosCajasRound | null>(null);
  const [error, setError] = useState('');

  const me = players.find((p) => p.id === myPlayerId) || null;
  const isHost = !!me?.is_host;

  // --- temporizador de turno: tick cada segundo mientras se está jugando ---
  const [now, setNow] = useState(() => Date.now());
  const skippingRef = useRef(false);

  useEffect(() => {
    if (room?.status !== 'playing' || !round || round.payload.finished) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [room?.status, round?.id, round?.payload?.finished]);

  const turnStartedAt = round?.payload?.turn_started_at;
  const remainingSeconds = turnStartedAt
    ? Math.max(0, TURN_SECONDS - Math.floor((now - new Date(turnStartedAt).getTime()) / 1000))
    : null;

  // Si se me acaba el tiempo a mí, paso mi propio turno (evita que la sala se trabe).
  useEffect(() => {
    if (!room || !round || !myPlayerId) return;
    if (room.status !== 'playing' || round.payload.finished) return;
    if (round.payload.turn !== myPlayerId) return;
    if (remainingSeconds !== 0) return;
    if (skippingRef.current) return;

    skippingRef.current = true;
    const newState = passTurn(round.payload);
    supabase
      .from('rounds')
      .update({ payload: newState })
      .eq('id', round.id)
      .then(() => {
        setRound({ ...round, payload: newState });
        skippingRef.current = false;
      });
  }, [remainingSeconds, room?.status, round?.payload?.turn]);

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
      if (latestRound) setRound(latestRound as PuntosCajasRound);
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rounds', filter: `room_id=eq.${room.id}` }, (payload) => {
        setRound(payload.new as PuntosCajasRound);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room?.id]);

  // --- acciones del anfitrión: iniciar partida ---
  async function startGame() {
    if (!room) return;

    const N = room.settings?.grid_dots || 5;
    const turnOrder = players.map((p) => p.id);
    const scores: Record<string, number> = {};
    turnOrder.forEach((id) => { scores[id] = 0; });

    // Estado inicial vacío del tablero
    const emptyState: PuntosCajasBoardState = {
      grid_dots: N,
      horizontal_lines: Array(N * (N - 1)).fill(false),
      vertical_lines: Array((N - 1) * N).fill(false),
      horizontal_owners: Array(N * (N - 1)).fill(null),
      vertical_owners: Array((N - 1) * N).fill(null),
      boxes: Array((N - 1) * (N - 1)).fill(null),
      turn_order: turnOrder,
      turn: turnOrder[0],
      turn_started_at: new Date().toISOString(),
      scores,
      finished: false,
      winner: null,
    };

    const { data: newRound } = await supabase
      .from('rounds')
      .insert({ room_id: room.id, round_number: 1, payload: emptyState })
      .select()
      .single();
    await supabase.from('rooms').update({ status: 'playing', current_round: 1 }).eq('id', room.id);
    setRound(newRound as PuntosCajasRound);
  }

  // --- jugar una línea ---
  async function playLine(lineType: 'horizontal' | 'vertical', lineIndex: number) {
    if (!room || !round || !myPlayerId) return;
    const state = round.payload;

    if (state.finished) return;

    try {
      let newState = drawLine(state, lineType, lineIndex, myPlayerId);

      if (isBoardFull(newState)) {
        newState = { ...newState, finished: true, winner: getWinner(newState.scores) };
      }

      await supabase
        .from('rounds')
        .update({ payload: newState })
        .eq('id', round.id);

      setRound({
        ...round,
        payload: newState,
        ...(newState.finished && { ended_at: new Date().toISOString() }),
      });

      if (newState.finished) {
        await finishGame(newState.scores);
      }
    } catch (e: any) {
      // Error de validación (no es turno, línea ya trazada)
      console.error(e.message);
    }
  }

  // --- finalizar partida y actualizar leaderboard ---
  async function finishGame(scores: Record<string, number>) {
    if (!room) return;
    await supabase.from('rooms').update({ status: 'finished' }).eq('id', room.id);

    // Actualizar leaderboard para cada jugador
    for (const p of players) {
      const score = scores[p.id] || 0;
      await supabase.from('leaderboard').upsert({
        nickname: p.nickname,
        game_type: GAME_TYPE,
        best_score: score,
        games_played: 1,
      });
    }
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

  // Renderizado del tablero
  const N = round?.payload?.grid_dots || 5;
  const payload = round?.payload || {
    grid_dots: N,
    horizontal_lines: [],
    vertical_lines: [],
    horizontal_owners: [],
    vertical_owners: [],
    boxes: [],
    turn_order: [],
    turn: '',
    turn_started_at: new Date().toISOString(),
    scores: {},
    finished: false,
    winner: null,
  };

  return (
    <Sheet brand="orpira.es · sala" maxWidth={640}>
      <div className="row" style={{ alignItems: 'baseline', marginBottom: 8 }}>
        <h1 className="title" style={{ fontSize: 34 }}>Puntos y Cajas</h1>
        <span className="code-display">{room.code}</span>
      </div>

      {/* Información de turno */}
      {round && round.payload && !round.payload.finished && (
        <div style={{ marginBottom: 12, fontSize: 13 }}>
          <strong>Turno de:</strong>{' '}
          {round.payload.turn === myPlayerId
            ? 'vos'
            : players.find((p) => p.id === round.payload.turn)?.nickname || '—'}
          {remainingSeconds !== null && (
            <span style={{ marginLeft: 8, color: remainingSeconds <= 5 ? '#E24A6B' : '#6b7590' }}>
              ({remainingSeconds}s)
            </span>
          )}
        </div>
      )}

      {/* Estadísticas de jugadores */}
      {round && round.payload && (
        <div style={{ marginBottom: 12, fontSize: 12 }}>
          {players.map((p) => (
            <span key={p.id} style={{ marginRight: 16 }}>
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  background: colorForPlayer(round.payload.turn_order, p.id),
                  marginRight: 4,
                }}
              />
              {p.nickname}: {round.payload.scores[p.id] || 0} pts
            </span>
          ))}
        </div>
      )}

      {/* Tablero de juego */}
      {room.status === 'lobby' && room.current_round === 0 && (
        <Lobby players={players} isHost={isHost} onStart={startGame} />
      )}

{room.status === 'playing' && round && round.payload && (
      <Board
        gridDots={N}
        horizontalLines={payload.horizontal_lines}
        verticalLines={payload.vertical_lines}
        horizontalOwners={payload.horizontal_owners}
        verticalOwners={payload.vertical_owners}
        boxes={payload.boxes}
        turnOrder={payload.turn_order}
        turn={payload.turn}
        myPlayerId={myPlayerId}
        onLineClick={playLine}
        finished={round.payload.finished}
      />
    )}

      {room.status === 'finished' && (
      <FinalResults
        players={players}
        winner={getWinner(round!.payload!.scores)}
        scores={round!.payload!.scores}
        code={code}
      />
    )}
    </Sheet>
  );
}

// ---------------------------------------------------------------
// Sala de espera: configura el turno_order y espera a que el host inicie
// ---------------------------------------------------------------
function Lobby({ players, isHost, onStart }: { players: Player[]; isHost: boolean; onStart: () => void }) {
  const turnOrder = players.map((p) => p.id);

  return (
    <>
      <p className="subtitle">Comparte el código con tus amigos.</p>

      <div style={{ marginBottom: 20 }}>
        <span className="field-label">Jugadores</span>
        {players.map((p, i) => (
          <PlayerChip key={p.id}>
            {p.nickname}{i > 0 ? ` · ${i}` : ''}{p.is_host ? ' · anfitrión' : ''}
          </PlayerChip>
        ))}
      </div>

      {isHost ? (
        <Button variant="stop" style={{ width: '100%' }} onClick={onStart} disabled={players.length < 2}>
          Empezar partida
        </Button>
      ) : (
        <p>Esperando a que el anfitrión empiece la partida…</p>
      )}
    </>
  );
}

// ---------------------------------------------------------------
// Tablero de juego: líneas y cajas
// ---------------------------------------------------------------
function Board({
  gridDots,
  horizontalLines,
  verticalLines,
  horizontalOwners,
  verticalOwners,
  boxes,
  turnOrder,
  turn,
  myPlayerId,
  onLineClick,
  finished,
}: {
  gridDots: number;
  horizontalLines: boolean[];
  verticalLines: boolean[];
  horizontalOwners: (string | null)[];
  verticalOwners: (string | null)[];
  boxes: (string | null)[];
  turnOrder: string[];
  turn: string;
  myPlayerId: string | null;
  onLineClick: (lineType: 'horizontal' | 'vertical', lineIndex: number) => void;
  finished: boolean;
}) {
  const N = gridDots;
  const cellSize = 40;

  // Determinar si el jugador actual puede mover
  const canMove = !finished && turn === myPlayerId;

  // Calcular estilos + manejador de clic de líneas horizontales
  const hLines: { style: React.CSSProperties; onClick?: () => void }[] = [];
  for (let i = 0; i < N * (N - 1); i++) {
    const { row, col } = horizontalLineCoords(N, i);
    const drawn = !!horizontalLines[i];
    const clickable = canMove && !drawn;
    hLines.push({
      style: {
        position: 'absolute',
        left: col * cellSize + 20,
        top: row * cellSize + 18,
        width: cellSize,
        height: 8,
        cursor: clickable ? 'pointer' : 'default',
        backgroundColor: drawn ? colorForPlayer(turnOrder, horizontalOwners[i]) : '#E0E0E0',
        borderRadius: 2,
        transition: 'background-color 0.1s',
      },
      onClick: clickable ? () => onLineClick('horizontal', i) : undefined,
    });
  }

  // Calcular estilos + manejador de clic de líneas verticales
  const vLines: { style: React.CSSProperties; onClick?: () => void }[] = [];
  for (let i = 0; i < (N - 1) * N; i++) {
    const { row, col } = verticalLineCoords(N, i);
    const drawn = !!verticalLines[i];
    const clickable = canMove && !drawn;
    vLines.push({
      style: {
        position: 'absolute',
        left: col * cellSize + 18,
        top: row * cellSize + 20,
        width: 8,
        height: cellSize,
        cursor: clickable ? 'pointer' : 'default',
        backgroundColor: drawn ? colorForPlayer(turnOrder, verticalOwners[i]) : '#E0E0E0',
        borderRadius: 2,
        transition: 'background-color 0.1s',
      },
      onClick: clickable ? () => onLineClick('vertical', i) : undefined,
    });
  }

  return (
    <div
      style={{
        position: 'relative',
        width: N * cellSize + 40,
        height: (N - 1) * cellSize + 40,
        margin: 'auto',
      }}
    >
      {/* Puntos (dots) */}
      {Array(N * N)
        .fill(0)
        .map((_, i) => {
          const r = Math.floor(i / N);
          const c = i % N;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: c * cellSize + 20,
                top: r * cellSize + 20,
                width: 16,
                height: 16,
                borderRadius: 8,
                background: '#C0C0C0',
                border: '2px solid white',
              }}
            />
          );
        })}

      {/* Líneas horizontales */}
      {hLines.map((l, i) => (
        <div key={i} style={l.style} onClick={l.onClick} />
      ))}

      {/* Líneas verticales */}
      {vLines.map((l, i) => (
        <div key={`v-${i}`} style={l.style} onClick={l.onClick} />
      ))}

      {/* Cajas completadas */}
      {Array((N - 1) * (N - 1))
        .fill(0)
        .map((_, i) => {
          const owner = boxes[i];
          if (!owner) return null;
          const r = Math.floor(i / (N - 1));
          const c = i % (N - 1);
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: c * cellSize + 20,
                top: r * cellSize + 20,
                width: cellSize,
                height: cellSize,
                background: colorForPlayer(turnOrder, owner),
                opacity: 0.5,
              }}
            />
          );
        })}
    </div>
  );
}

// ---------------------------------------------------------------
// Resultado final
// ---------------------------------------------------------------
function FinalResults({ players, winner, scores, code }: { players: Player[]; winner: string | 'draw' | null; scores: Record<string, number>; code: string }) {
  // Ordenar por puntuación descendente
  const sorted = [...players]
    .sort((a, b) => (scores[b.id || ''] || 0) - (scores[a.id || ''] || 0))
    .sort((a, b) => (b.id || '').localeCompare(a.id || ''));

  return (
    <Sheet brand="orpira.es · sala" maxWidth={480}>
      <div style={{ marginBottom: 18 }}>
        <Stamp>{winner === 'draw' ? 'EMPATE' : `GANÓ ${winner?.toUpperCase()}`}</Stamp>
      </div>

      <ScoreTable
        headers={['Jugador', 'Cajas']}
        rows={sorted.map((p) => ({ key: p.id, cells: [p.nickname, scores[p.id] || 0] }))}
      />

      <p style={{ marginTop: 16 }}>
        <a href="/ranking?game=puntos-cajas" style={{ color: 'var(--ink-blue)' }}>Ver ranking global →</a>
        <a href="/juegos/puntos-cajas" style={{ color: 'var(--ink-blue)' }}>Jugar otra partida</a>
      </p>
    </Sheet>
  );
}