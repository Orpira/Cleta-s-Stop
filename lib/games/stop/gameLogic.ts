import { Room } from '../../core/supabaseClient';
import { ValidationMode } from '../shared/wordGameLogic';

export interface StopRoom extends Room {
  current_letter: string | null;
}

export interface StopSettings {
  validation_mode: ValidationMode;
  max_players: number;
  round_seconds: number;
  categories: string[];
  rounds_to_play: number;
}

export const DEFAULT_STOP_SETTINGS: StopSettings = {
  validation_mode: 'vote',
  max_players: 8,
  round_seconds: 60,
  categories: ['Nombre', 'Apellido', 'Animal', 'Fruta', 'Color', 'Ciudad', 'Cosa'],
  rounds_to_play: 5,
};
