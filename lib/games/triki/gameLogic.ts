export type Mark = 'X' | 'O';

export interface TrikiSettings {
  max_players: number; // siempre 2, no configurable desde la UI
}

export const DEFAULT_TRIKI_SETTINGS: TrikiSettings = {
  max_players: 2,
};

export interface TrikiPayload {
  board: (Mark | null)[]; // 9 celdas, índice 0-8 fila por fila
  turn: Mark;
  winner: Mark | 'draw' | null;
  winning_line: number[] | null;
}

export interface TrikiRound {
  id: string;
  room_id: string;
  round_number: number;
  payload: TrikiPayload;
  ended_at: string | null;
}

export function emptyPayload(starting: Mark = 'X'): TrikiPayload {
  return { board: Array(9).fill(null), turn: starting, winner: null, winning_line: null };
}

// Ronda 1 empieza X (el anfitrión); cada revancha alterna quién arranca.
export function startingMarkFor(roundNumber: number): Mark {
  return roundNumber % 2 === 1 ? 'X' : 'O';
}

const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // filas
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // columnas
  [0, 4, 8], [2, 4, 6],            // diagonales
];

export function checkWinner(board: (Mark | null)[]): { winner: Mark | 'draw' | null; line: number[] | null } {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line };
    }
  }
  if (board.every((cell) => cell !== null)) {
    return { winner: 'draw', line: null };
  }
  return { winner: null, line: null };
}
