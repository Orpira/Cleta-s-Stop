import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: { params: { eventsPerSecond: 10 } },
});

export type RoomStatus = 'lobby' | 'playing' | 'round_review' | 'finished';

export interface Room {
  id: string;
  code: string;
  host_id: string;
  status: RoomStatus;
  game_type: string;
  settings: Record<string, any>;
  current_round: number;
}

export interface Player {
  id: string;
  room_id: string;
  nickname: string;
  is_host: boolean;
  total_score: number;
  connected: boolean;
}

export interface LeaderboardRow {
  id: string;
  nickname: string;
  game_type: string;
  best_score: number;
  games_played: number;
}
