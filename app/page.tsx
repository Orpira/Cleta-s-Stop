'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, DEFAULT_SETTINGS } from '../lib/supabaseClient';
import { generateRoomCode } from '../lib/gameLogic';

export default function Home() {
  const router = useRouter();
  const [nickname, setNickname] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    if (!nickname.trim()) return setError('Escribe tu nombre para continuar.');
    setLoading(true);
    setError('');
    try {
      const hostId = crypto.randomUUID();
      let code = generateRoomCode();

      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .insert({ code, host_id: hostId, settings: DEFAULT_SETTINGS })
        .select()
        .single();
      if (roomError) throw roomError;

      const { data: player, error: playerError } = await supabase
        .from('players')
        .insert({ room_id: room.id, nickname, is_host: true })
        .select()
        .single();
      if (playerError) throw playerError;

      localStorage.setItem(`stop_player_${room.code}`, player.id);
      router.push(`/sala/${room.code}`);
    } catch (e: any) {
      setError('No se pudo crear la sala. Intenta de nuevo.');
      setLoading(false);
    }
  }

  async function handleJoin() {
    if (!nickname.trim()) return setError('Escribe tu nombre para continuar.');
    if (!joinCode.trim()) return setError('Escribe el código de la sala.');
    setLoading(true);
    setError('');
    try {
      const code = joinCode.trim().toUpperCase();
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select('*')
        .eq('code', code)
        .single();
      if (roomError || !room) throw new Error('not found');

      const { count } = await supabase
        .from('players')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', room.id);

      if ((count ?? 0) >= room.settings.max_players) {
        setError('Esa sala ya está completa.');
        setLoading(false);
        return;
      }

      const { data: player, error: playerError } = await supabase
        .from('players')
        .insert({ room_id: room.id, nickname, is_host: false })
        .select()
        .single();
      if (playerError) throw playerError;

      localStorage.setItem(`stop_player_${room.code}`, player.id);
      router.push(`/sala/${room.code}`);
    } catch (e: any) {
      setError('No se encontró esa sala. Revisa el código.');
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="sheet">
        <div className="brand">orpira.es</div>
        <h1 className="title">¡Stop!</h1>
        <p className="subtitle">
          El clásico juego de papel — ahora en línea, con puntuaciones y ranking en vivo.
        </p>

        <div className="row" style={{ marginBottom: 24 }}>
          <button
            className={mode === 'create' ? 'btn btn-primary' : 'btn btn-ghost'}
            onClick={() => setMode('create')}
          >
            Crear sala
          </button>
          <button
            className={mode === 'join' ? 'btn btn-primary' : 'btn btn-ghost'}
            onClick={() => setMode('join')}
          >
            Unirme a una sala
          </button>
        </div>

        <label className="field-label">Tu nombre</label>
        <input
          className="input"
          placeholder="¿Cómo te llamas?"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          style={{ marginBottom: 20 }}
        />

        {mode === 'join' && (
          <>
            <label className="field-label">Código de la sala</label>
            <input
              className="input"
              placeholder="EJ. AB3X9"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              style={{ marginBottom: 20 }}
            />
          </>
        )}

        {error && (
          <p style={{ color: 'var(--stamp-red)', fontSize: 14, marginBottom: 16 }}>{error}</p>
        )}

        <button
          className="btn btn-stop"
          style={{ width: '100%' }}
          disabled={loading}
          onClick={mode === 'create' ? handleCreate : handleJoin}
        >
          {loading ? 'Un momento…' : mode === 'create' ? 'Crear sala y configurar partida' : 'Unirme'}
        </button>
      </div>
    </div>
  );
}
