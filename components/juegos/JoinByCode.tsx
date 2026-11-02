'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/core/supabaseClient';
import { getStoredPlayerId } from '@/lib/core/roomActions';
import { ROOM_GAME_SLUGS } from '@/lib/games/catalog';

/**
 * "¿Te han pasado un código?": busca la sala por su código, sin tener que
 * saber de qué juego es, y lleva a donde toca: a la sala si ya estabas en
 * ella (o si es ¡Stop!, que deja entrar desde la propia sala) y, si no, a la
 * portada del juego con el código ya puesto.
 */
export function JoinByCode() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (normalized.length !== 5) return setError('El código tiene 5 letras o números, por ejemplo AB3X9.');
    setLoading(true);
    setError('');
    try {
      const { data } = await supabase
        .from('rooms')
        .select('code, game_type, status')
        .eq('code', normalized)
        .in('game_type', ROOM_GAME_SLUGS)
        .maybeSingle();
      if (!data) {
        setError('No encontramos esa sala. Revisa el código.');
        return setLoading(false);
      }
      if (data.status === 'finished') {
        setError('Esa partida ya terminó. Pide un código nuevo o crea tu sala.');
        return setLoading(false);
      }
      const type = data.game_type as string;
      const alreadyIn = !!getStoredPlayerId(type, normalized);
      router.push(
        alreadyIn || type === 'stop' ? `/juegos/${type}/sala/${normalized}` : `/juegos/${type}?codigo=${normalized}`
      );
    } catch {
      setError('No se pudo buscar la sala. Intenta de nuevo.');
      setLoading(false);
    }
  }

  return (
    <form className="join-code" onSubmit={submit} noValidate>
      <label htmlFor="join-code-input" className="join-code-label">
        ¿Te han pasado un código?
      </label>
      <div className="join-code-row">
        <input
          id="join-code-input"
          className="join-code-input"
          placeholder="AB3X9"
          value={code}
          maxLength={8}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          aria-describedby={error ? 'join-code-error' : undefined}
        />
        <button type="submit" className="btn btn-stop" disabled={loading}>
          {loading ? 'Buscando…' : 'Unirme'}
        </button>
      </div>
      {error && (
        <p id="join-code-error" className="join-code-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
