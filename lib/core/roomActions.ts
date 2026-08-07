import { supabase, Room, Player } from './supabaseClient';

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin caracteres ambiguos
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.replace(/[ÑWKX]/g, ''); // letras jugables por defecto en es-ES

export function drawRandomLetter(excludeLetters: string[] = []): string {
  const pool = ALPHABET.split('').filter((l) => !excludeLetters.includes(l));
  const source = pool.length > 0 ? pool : ALPHABET.split('');
  return source[Math.floor(Math.random() * source.length)];
}

function playerStorageKey(gameType: string, code: string): string {
  return `${gameType}_player_${code}`;
}

export function getStoredPlayerId(gameType: string, code: string): string | null {
  return localStorage.getItem(playerStorageKey(gameType, code));
}

export async function createRoom(
  gameType: string,
  nickname: string,
  defaultSettings: Record<string, any>
): Promise<{ room: Room; player: Player }> {
  const hostId = crypto.randomUUID();
  const code = generateRoomCode();

  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .insert({ code, host_id: hostId, game_type: gameType, settings: defaultSettings })
    .select()
    .single();
  if (roomError) throw roomError;

  const { data: player, error: playerError } = await supabase
    .from('players')
    .insert({ room_id: room.id, nickname, is_host: true })
    .select()
    .single();
  if (playerError) throw playerError;

  localStorage.setItem(playerStorageKey(gameType, room.code), player.id);
  return { room: room as Room, player: player as Player };
}

export async function joinRoom(
  gameType: string,
  code: string,
  nickname: string
): Promise<{ room: Room; player: Player }> {
  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('*')
    .eq('code', code)
    .eq('game_type', gameType)
    .single();
  if (roomError || !room) throw new Error('room_not_found');

  const { count } = await supabase
    .from('players')
    .select('*', { count: 'exact', head: true })
    .eq('room_id', room.id);

  if ((count ?? 0) >= room.settings.max_players) {
    throw new Error('room_full');
  }

  const { data: player, error: playerError } = await supabase
    .from('players')
    .insert({ room_id: room.id, nickname, is_host: false })
    .select()
    .single();
  if (playerError) throw playerError;

  localStorage.setItem(playerStorageKey(gameType, room.code), player.id);
  return { room: room as Room, player: player as Player };
}
