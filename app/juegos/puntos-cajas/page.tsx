'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createRoom, joinRoom } from '@/lib/core/roomActions';
import { DEFAULT_PUNTOS_CAJAS_SETTINGS } from '@/lib/games/puntos-cajas/gameLogic';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const GAME_TYPE = 'puntos-cajas';

export default function PuntosCajasHome() {
  const router = useRouter();
  const [nickname, setNickname] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [maxPlayers, setMaxPlayers] = useState(2);
  const [gridDots, setGridDots] = useState(5);

  async function handleCreate() {
    if (!nickname.trim()) return setError('Escribe tu nombre para continuar.');
    setLoading(true);
    setError('');
    try {
      const settings = {
        max_players: maxPlayers,
        grid_dots: gridDots,
      };
      const { room } = await createRoom(GAME_TYPE, nickname, settings);
      router.push(`/juegos/puntos-cajas/sala/${room.code}`);
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
      const { room } = await joinRoom(GAME_TYPE, code, nickname);
      router.push(`/juegos/puntos-cajas/sala/${room.code}`);
    } catch (e: any) {
      if (e?.message === 'room_full') {
        setError('Esa sala ya está completa.');
      } else {
        setError('No se encontró esa sala. Revisa el código.');
      }
      setLoading(false);
    }
  }

  return (
    <Sheet brand="orpira.es">
      <h1 className="title">Puntos y Cajas</h1>
      <p className="subtitle">
        El clásico juego de papel de conectar puntos y formar cajas.
      </p>

      <div className="row" style={{ marginBottom: 24 }}>
        <Button variant={mode === 'create' ? 'primary' : 'ghost'} onClick={() => setMode('create')}>
          Crear sala
        </Button>
        <Button variant={mode === 'join' ? 'primary' : 'ghost'} onClick={() => setMode('join')}>
          Unirme a una sala
        </Button>
      </div>

      <label className="field-label">Tu nombre</label>
      <Input
        placeholder="¿Cómo te llamas?"
        value={nickname}
        onChange={(e) => setNickname(e.target.value)}
        style={{ marginBottom: 20 }}
      />

      {mode === 'join' && (
        <>
          <label className="field-label">Código de la sala</label>
          <Input
            placeholder="EJ. AB3X9"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            style={{ marginBottom: 20 }}
          />
        </>
      )}

      {mode === 'create' && (
        <div style={{ marginBottom: 20, marginTop: 16 }}>
          <p className="subtitle">Configurar partida</p>

          <div style={{ marginBottom: 12 }}>
            <span className="field-label">Máx. de jugadores</span>
            <Input
              type="number"
              min={2}
              max={4}
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
              style={{ width: 100 }}
            />
            <span style={{ marginLeft: 16, fontSize: 12, color: '#6b7590' }}>2 - 4</span>
          </div>

          <div style={{ marginBottom: 12 }}>
            <span className="field-label">Puntos por lado</span>
            <Input
              type="number"
              min={3}
              max={10}
              value={gridDots}
              onChange={(e) => setGridDots(Number(e.target.value))}
              style={{ width: 100 }}
            />
            <span style={{ marginLeft: 16, fontSize: 12, color: '#6b7590' }}>3 - 10 (ej. 5 = tablero 4x4)</span>
          </div>
        </div>
      )}

      {error && (
        <p style={{ color: 'var(--stamp-red)', fontSize: 14, marginBottom: 16 }}>{error}</p>
      )}

      <Button
        variant="stop"
        style={{ width: '100%' }}
        disabled={loading}
        onClick={mode === 'create' ? handleCreate : handleJoin}
      >
        {loading ? 'Un momento…' : mode === 'create' ? 'Crear sala' : 'Unirme'}
      </Button>
    </Sheet>
  );
}