'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase, Player, Room } from '@/lib/core/supabaseClient';
import { getStoredPlayerId } from '@/lib/core/roomActions';
import {
  drawLine,
  isBoardFull,
  getWinner,
  PuntosCajasBoardState,
  PuntosCajasRound,
  horizontalLineCoords,
  verticalLineCoords,
} from '@/lib/games/puntos-cajas/gameLogic';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PlayerChip } from '@/components/ui/PlayerChip';
import { ScoreTable } from '@/components/ui/ScoreTable';
import { Stamp } from '@/components/ui/Stamp';

const GAME_TYPE = 'puntos-cajas';

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

    // Estado inicial vacío del tablero
    const emptyState: PuntosCajasBoardState = {
      grid_dots: room.settings?.grid_dots || 5,
      horizontal_lines: [],
      vertical_lines: [],
      boxes: [],
      turn_order: [],
      turn: '',
      scores: {},
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
      const newState = drawLine(state, lineType, lineIndex, myPlayerId);

      await supabase
        .from('rounds')
        .update({ payload: newState })
        .eq('id', round.id);

      setRound({
        ...round,
        payload: newState,
        ...(newState.finished && { ended_at: new Date().toISOString() }),
      });
    } catch (e: any) {
      // Error de validación (no es turno, línea ya trazada)
      console.error(e.message);
    }
  }

  // --- finalizar partida y actualizar leaderboard ---
  async function finishGame() {
    if (!room) return;
    const winner = getWinner(round?.payload?.scores || {});
    await supabase.from('rooms').update({ status: 'finished' }).eq('id', room.id);

    // Actualizar leaderboard para cada jugador
    for (const p of players) {
      const score = round?.payload?.scores[p.id] || 0;
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
    boxes: [],
    turn_order: [],
    turn: '',
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
      {round && round.payload && (
        <div style={{ marginBottom: 12, fontSize: 13 }}>
          <strong>Turno de:</strong> {round.payload.turn || '—'}
        </div>
      )}

      {/* Estadísticas de jugadores */}
      {round && round.payload && (
        <div style={{ marginBottom: 12, fontSize: 12 }}>
          {players.map((p) => (
            <span key={p.id} style={{ marginRight: 16 }}>
              {p.nickname}: {round.payload.scores[p.id] || 0} pts
            </span>
          ))}
        </div>
      )}

      {/* Tablero de juego */}
      {room.status === 'lobby' && round && round.payload && round.payload.turn_order.length === 0 && room.current_round === 1 && (
        <Lobby players={players} isHost={isHost} onStart={startGame} />
      )}

{room.status === 'playing' && round && round.payload && (
      <Board
        gridDots={N}
        horizontalLines={payload.horizontal_lines}
        verticalLines={payload.vertical_lines}
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

  // Calcular estilos de líneas horizontales
  const hLineStyles: React.CSSProperties[] = [];
  for (let i = 0; i < N * (N - 1); i++) {
    const { row, col } = horizontalLineCoords(N, i);
    const takenBy = boxes?.[i] || null;
    hLineStyles.push({
      position: 'absolute',
      left: col * (cellSize / (N - 1)) + 20,
      top: row * cellSize + 20,
      width: cellSize / (N - 1) - 4,
      height: 4,
      backgroundColor: takenBy ? '#4A90E2' : '#C0C0C0',
      borderRadius: 2,
      transition: 'background-color 0.1s',
    });
  }

  // Calcular estilos de líneas verticales
  const vLineStyles: React.CSSProperties[] = [];
  for (let i = 0; i < (N - 1) * N; i++) {
    const { row, col } = verticalLineCoords(N, i);
    // Determinar qué caja toca esta línea vertical
    // Una línea vertical en (row, col) toca la caja a su izquierda (col-1) y a su derecha (col)
    // Para simplificar, coloreamos si alguna caja adyacente está completada con este jugador
    let takenBy: string | null = null;
    // Caja de la izquierda
    if (col > 0) {
      const boxIdx = row * (N - 1) + (col - 1);
      if (boxes[boxIdx] === myPlayerId) takenBy = myPlayerId;
    }
    // Caja de la derecha
    if (col < N - 1 && takenBy === null) {
      const boxIdx = row * (N - 1) + col;
      if (boxes[boxIdx] === myPlayerId) takenBy = myPlayerId;
    }

    vLineStyles.push({
      position: 'absolute',
      left: col * cellSize + 20,
      top: row * cellSize + 20,
      width: 4,
      height: cellSize,
      backgroundColor: takenBy ? '#4A90E2' : '#C0C0C0',
      borderRadius: 2,
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
      {hLineStyles.map((s, i) => (
        <div key={i} style={s} />
      ))}

      {/* Líneas verticales */}
      {vLineStyles.map((s, i) => (
        <div key={`v-${i}`} style={s} />
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
                background: '#4A90E2',
                opacity: 0.7,
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