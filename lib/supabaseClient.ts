import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: { params: { eventsPerSecond: 10 } },
});

export type ValidationMode = 'vote' | 'host' | 'auto_nonempty';

export interface RoomSettings {
  validation_mode: ValidationMode;
  max_players: number;
  round_seconds: number;
  categories: string[];
  rounds_to_play: number;
}

export const DEFAULT_SETTINGS: RoomSettings = {
  validation_mode: 'vote',
  max_players: 8,
  round_seconds: 60,
  categories: ['Nombre', 'Apellido', 'Animal', 'Fruta', 'Color', 'Ciudad', 'Cosa'],
  rounds_to_play: 5,
};

export interface Room {
  id: string;
  code: string;
  host_id: string;
  status: 'lobby' | 'playing' | 'round_review' | 'finished';
  settings: RoomSettings;
  current_round: number;
  current_letter: string | null;
}

export interface Player {
  id: string;
  room_id: string;
  nickname: string;
  is_host: boolean;
  total_score: number;
  connected: boolean;
}

export interface Answer {
  id: string;
  round_id: string;
  player_id: string;
  category: string;
  word: string;
  is_valid: boolean | null;
  points: number;
}
