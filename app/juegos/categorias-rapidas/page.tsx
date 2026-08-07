'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createRoom, joinRoom } from '@/lib/core/roomActions';
import { DEFAULT_CATEGORIAS_SETTINGS } from '@/lib/games/categorias-rapidas/gameLogic';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const GAME_TYPE = 'categorias-rapidas';

export default function CategoriasRapidasHome() {
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
      const { room } = await createRoom(GAME_TYPE, nickname, DEFAULT_CATEGORIAS_SETTINGS);
      router.push(`/juegos/categorias-rapidas/sala/${room.code}`);
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
      router.push(`/juegos/categorias-rapidas/sala/${room.code}`);
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
      <h1 className="title">Categorías rápidas</h1>
      <p className="subtitle">
        Como el Stop de siempre, pero con un banco de categorías mucho más grande —
        cada ronda sortea cuáles te tocan.
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

      {error && (
        <p style={{ color: 'var(--stamp-red)', fontSize: 14, marginBottom: 16 }}>{error}</p>
      )}

      <Button
        variant="stop"
        style={{ width: '100%' }}
        disabled={loading}
        onClick={mode === 'create' ? handleCreate : handleJoin}
      >
        {loading ? 'Un momento…' : mode === 'create' ? 'Crear sala y configurar partida' : 'Unirme'}
      </Button>
    </Sheet>
  );
}
