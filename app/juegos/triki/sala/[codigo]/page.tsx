'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase, Player, Room } from '@/lib/core/supabaseClient';
import { getStoredPlayerId } from '@/lib/core/roomActions';
import { applyRoundScores, upsertLeaderboardResult } from '@/lib/core/scoring';
import { Mark, TrikiPayload, TrikiRound, emptyPayload, checkWinner, startingMarkFor } from '@/lib/games/triki/gameLogic';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { PlayerChip } from '@/components/ui/PlayerChip';
import { ScoreTable } from '@/components/ui/ScoreTable';
import { Stamp } from '@/components/ui/Stamp';

const GAME_TYPE = 'triki';

export default function TrikiRoomPage() {
  const params = useParams<{ codigo: string }>();
  const code = (params.codigo || '').toUpperCase();

  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [round, setRound] = useState<TrikiRound | null>(null);
  const [error, setError] = useState('');

  const me = players.find((p) => p.id === myPlayerId) || null;
  const isHost = !!me?.is_host;

  // Primer jugador en unirse (siempre el anfitrión, por orden de joined_at) juega con X.
  function symbolFor(player: Player | null): Mark | null {
    if (!player) return null;
    const idx = players.findIndex((p) => p.id === player.id);
    return idx === -1 ? null : idx === 0 ? 'X' : 'O';
  }

  const mySymbol = symbolFor(me);

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
      if (latestRound) setRound(latestRound as TrikiRound);
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
        if (payload.eventType === 'DELETE') return;
        setRound(payload.new as TrikiRound);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room?.id]);

  // --- acciones del anfitrión: iniciar / revancha / terminar ---
  async function startGame() {
    if (!room) return;
    const { data: newRound } = await supabase
      .from('rounds')
      .insert({ room_id: room.id, round_number: 1, payload: emptyPayload(startingMarkFor(1)) })
      .select()
      .single();
    await supabase.from('rooms').update({ status: 'playing', current_round: 1 }).eq('id', room.id);
    setRound(newRound as TrikiRound);
  }

  async function rematch() {
    if (!room || !round) return;
    const nextNumber = round.round_number + 1;
    const { data: newRound } = await supabase
      .from('rounds')
      .insert({ room_id: room.id, round_number: nextNumber, payload: emptyPayload(startingMarkFor(nextNumber)) })
      .select()
      .single();
    await supabase.from('rooms').update({ status: 'playing', current_round: nextNumber }).eq('id', room.id);
    setRound(newRound as TrikiRound);
  }

  async function finishGame() {
    if (!room) return;
    await supabase.from('rooms').update({ status: 'finished' }).eq('id', room.id);
    for (const p of players) {
      await upsertLeaderboardResult(GAME_TYPE, p.nickname, p.total_score);
    }
  }

  // --- jugar una celda ---
  async function playMove(index: number) {
    if (!room || !round || !mySymbol) return;
    const payload = round.payload;
    if (payload.winner || payload.board[index] || payload.turn !== mySymbol) return;

    const board = [...payload.board];
    board[index] = mySymbol;
    const { winner, line } = checkWinner(board);
    const newPayload: TrikiPayload = {
      board,
      turn: mySymbol === 'X' ? 'O' : 'X',
      winner,
      winning_line: line,
    };

    await supabase
      .from('rounds')
      .update({ payload: newPayload, ended_at: winner ? new Date().toISOString() : null })
      .eq('id', round.id);

    if (winner && winner !== 'draw') {
      const winnerPlayer = players.find((p) => symbolFor(p) === winner);
      if (winnerPlayer) {
        await applyRoundScores(players, [{ player_id: winnerPlayer.id, points: 1 }]);
      }
    }
    if (winner) {
      await supabase.from('rooms').update({ status: 'lobby' }).eq('id', room.id);
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

  return (
    <Sheet brand="orpira.es · sala" maxWidth={480}>
      <div className="row" style={{ alignItems: 'baseline', marginBottom: 8 }}>
        <h1 className="title" style={{ fontSize: 34 }}>Triki</h1>
        <span className="code-display">{room.code}</span>
      </div>

      {room.status === 'lobby' && room.current_round === 0 && (
        <Lobby players={players} isHost={isHost} onStart={startGame} />
      )}

      {room.status === 'playing' && round && (
        <Board payload={round.payload} mySymbol={mySymbol} onPlay={playMove} />
      )}

      {room.status === 'lobby' && room.current_round > 0 && round && (
        <MatchResult
          payload={round.payload}
          players={players}
          symbolFor={symbolFor}
          isHost={isHost}
          onRematch={rematch}
          onFinish={finishGame}
        />
      )}

      {room.status === 'finished' && <FinalResults players={players} symbolFor={symbolFor} />}
    </Sheet>
  );
}

// ---------------------------------------------------------------
// Sala de espera: se necesitan exactamente 2 jugadores para empezar
// ---------------------------------------------------------------
function Lobby({
  players,
  isHost,
  onStart,
}: {
  players: Player[];
  isHost: boolean;
  onStart: () => void;
}) {
  return (
    <>
      <p className="subtitle">Comparte el código con la otra persona. Se juega entre 2.</p>

      <div style={{ marginBottom: 20 }}>
        <span className="field-label">Jugadores ({players.length}/2)</span>
        {players.map((p, i) => (
          <PlayerChip key={p.id}>
            {p.nickname} · {i === 0 ? 'X' : 'O'}
            {p.is_host ? ' · anfitrión' : ''}
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
// Tablero 3x3
// ---------------------------------------------------------------
function Board({
  payload,
  mySymbol,
  onPlay,
}: {
  payload: TrikiPayload;
  mySymbol: Mark | null;
  onPlay: (index: number) => void;
}) {
  const canPlay = payload.winner === null && payload.turn === mySymbol;

  return (
    <>
      <p className="subtitle">
        Juegas con <strong>{mySymbol ?? '—'}</strong> — {canPlay ? 'tu turno' : 'turno de la otra persona'}
      </p>

      <div className="triki-board">
        {payload.board.map((cell, i) => (
          <button
            key={i}
            className={`triki-cell${payload.winning_line?.includes(i) ? ' triki-cell-win' : ''}`}
            disabled={!canPlay || cell !== null}
            onClick={() => onPlay(i)}
          >
            {cell}
          </button>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------
// Resultado de la partida: revancha o terminar (solo anfitrión)
// ---------------------------------------------------------------
function MatchResult({
  payload,
  players,
  symbolFor,
  isHost,
  onRematch,
  onFinish,
}: {
  payload: TrikiPayload;
  players: Player[];
  symbolFor: (p: Player | null) => Mark | null;
  isHost: boolean;
  onRematch: () => void;
  onFinish: () => void;
}) {
  const winnerName =
    payload.winner === 'draw'
      ? null
      : players.find((p) => symbolFor(p) === payload.winner)?.nickname;

  const sorted = [...players].sort((a, b) => b.total_score - a.total_score);

  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <Stamp>{payload.winner === 'draw' ? 'EMPATE' : `GANÓ ${winnerName?.toUpperCase()}`}</Stamp>
      </div>

      <ScoreTable
        headers={['Jugador', 'Símbolo', 'Victorias']}
        rows={sorted.map((p) => ({ key: p.id, cells: [p.nickname, symbolFor(p), p.total_score] }))}
      />

      {isHost && (
        <div className="row" style={{ marginTop: 20 }}>
          <Button variant="stop" onClick={onRematch}>
            Revancha
          </Button>
          <Button variant="ghost" onClick={onFinish}>
            Terminar partida
          </Button>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------
// Resultado final: la sala se cierra y queda registrada en el ranking
// ---------------------------------------------------------------
function FinalResults({
  players,
  symbolFor,
}: {
  players: Player[];
  symbolFor: (p: Player | null) => Mark | null;
}) {
  const sorted = [...players].sort((a, b) => b.total_score - a.total_score);
  return (
    <>
      <div style={{ marginBottom: 18 }}>
        <Stamp>FIN DE LA PARTIDA</Stamp>
      </div>
      <ScoreTable
        headers={['#', 'Jugador', 'Símbolo', 'Victorias']}
        rows={sorted.map((p, i) => ({ key: p.id, cells: [i + 1, p.nickname, symbolFor(p), p.total_score] }))}
      />
      <p style={{ marginTop: 16 }}>
        <a href="/ranking?game=triki" style={{ color: 'var(--ink-blue)' }}>Ver ranking global (top 5) →</a>
      </p>
      <p style={{ marginTop: 8 }}>
        <a href="/juegos/triki" style={{ color: 'var(--ink-blue)' }}>Jugar otra partida</a>
      </p>
    </>
  );
}
