import { Room } from '../../core/supabaseClient';
import { ValidationMode } from '../shared/wordGameLogic';

export const CATEGORY_POOL: string[] = [
  'Nombre',
  'Apellido',
  'Animal',
  'Fruta',
  'Color',
  'Ciudad',
  'Cosa',
  'Comida',
  'Deporte',
  'Película',
  'Profesión',
  'Marca',
  'Instrumento musical',
  'País',
  'Objeto escolar',
  'Superhéroe',
  'Serie de TV',
  'Videojuego',
  'Bebida',
  'Personaje histórico',
];

export function drawRandomCategories(count: number, pool: string[] = CATEGORY_POOL): string[] {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, pool.length));
}

export interface CategoriasRoom extends Room {
  current_letter: string | null;
}

export interface CategoriasSettings {
  validation_mode: ValidationMode;
  max_players: number;
  round_seconds: number;
  rounds_to_play: number;
  categories_per_round: number;
}

export const DEFAULT_CATEGORIAS_SETTINGS: CategoriasSettings = {
  validation_mode: 'vote',
  max_players: 8,
  round_seconds: 60,
  rounds_to_play: 5,
  categories_per_round: 5,
};
