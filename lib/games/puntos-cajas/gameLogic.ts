export interface PuntosCajasSettings {
  max_players: number; // 2 a 4, configurable por el anfitrión
  grid_dots: number; // puntos por lado, ej. 5 (→ tablero de 4x4 cajas), default 5
}

export const DEFAULT_PUNTOS_CAJAS_SETTINGS: PuntosCajasSettings = {
  max_players: 2,
  grid_dots: 5,
};

export interface PuntosCajasBoardState {
  grid_dots: number;
  horizontal_lines: boolean[]; // líneas entre puntos horizontalmente adyacentes
  vertical_lines: boolean[]; // líneas entre puntos verticalmente adyacentes
  horizontal_owners: (string | null)[]; // player_id que trazó cada línea horizontal, o null
  vertical_owners: (string | null)[]; // player_id que trazó cada línea vertical, o null
  boxes: (string | null)[]; // player_id dueño de cada caja, o null si no está completa
  turn_order: string[]; // player_ids en orden de turno
  turn: string; // player_id de quien le toca mover ahora
  turn_started_at: string; // ISO timestamp de cuándo empezó el turno actual (para el temporizador)
  bonus_seconds: number; // segundos extra para el turno actual (se otorgan cuando el rival pierde el suyo por tiempo)
  scores: Record<string, number>; // player_id -> cajas ganadas
  finished: boolean;
  winner: string | 'draw' | null; // player_id, empate, o null si sigue en curso
}

/** Segundos que tiene cada jugador para mover antes de que se pase el turno. */
export const TURN_SECONDS = 20;

export interface PuntosCajasRound {
  id: string;
  room_id: string;
  round_number: number;
  payload: PuntosCajasBoardState;
  ended_at: string | null;
}

/**
 * Indexación de líneas para grid_dots = N:
 *
 * Líneas horizontales: N filas × (N-1) segmentos por fila
 *   índice = r * (N-1) + c,   r ∈ [0, N-1], c ∈ [0, N-2]
 *
 * Líneas verticales: (N-1) filas × N segmentos por fila
 *   índice = r * N + c,       r ∈ [0, N-2], c ∈ [0, N-1]
 *
 * Cajas: (N-1) × (N-1)
 *   índice = r * (N-1) + c,   r ∈ [0, N-2], c ∈ [0, N-2]
 *
 * Cada caja en posición de caja (br, bc) está limitada por:
 *   - horizontal_lines arriba:      br * (N-1) + bc
 *   - horizontal_lines abajo: (br+1) * (N-1) + bc
 *   - vertical_lines izquierda:     br * N + bc
 *   - vertical_lines derecha:   (br+1) * N + bc
 */

/** Calcula los índices de las 4 líneas que bordean una caja. */
function boxLineIndices(gridDots: number, boxIdx: number): {
  top: number;
  bottom: number;
  left: number;
  right: number;
} {
  const N = gridDots;
  const br = Math.floor(boxIdx / (N - 1));
  const bc = boxIdx % (N - 1);

  const top = br * (N - 1) + bc;
  const bottom = (br + 1) * (N - 1) + bc;
  const left = br * N + bc;
  const right = (br + 1) * N + bc;

  return { top, bottom, left, right };
}

/** Dado un índice de línea horizontal, devuelve su fila y columna de segmento. */
export function horizontalLineCoords(gridDots: number, lineIndex: number): { row: number; col: number } {
  const N = gridDots;
  const col = lineIndex % (N - 1);
  const row = Math.floor(lineIndex / (N - 1));
  return { row, col };
}

/** Dado un índice de línea vertical, devuelve su fila y columna de segmento. */
export function verticalLineCoords(gridDots: number, lineIndex: number): { row: number; col: number } {
  const N = gridDots;
  const col = lineIndex % N;
  const row = Math.floor(lineIndex / N);
  return { row, col };
}

/**
 * Verifica si una caja está completa: sus 4 líneas están trazadas
 * y la caja aún no tiene dueño (boxes[boxIdx] === null).
 */
function isBoxCompleted(
  horizontalLines: boolean[],
  verticalLines: boolean[],
  boxes: (string | null)[],
  boxIdx: number,
  gridDots: number
): boolean {
  const N = gridDots;
  const { top, bottom, left, right } = boxLineIndices(gridDots, boxIdx);

  const horizTop = horizontalLines[top];
  const horizBottom = horizontalLines[bottom];
  const vertLeft = verticalLines[left];
  const vertRight = verticalLines[right];

  return horizTop && horizBottom && vertLeft && vertRight && boxes[boxIdx] === null;
}

/**
 * Dibuja una línea, detecta cajas completadas y gestiona el turno.
 * Si el jugador completa al menos una caja, juega OTRA VEZ (mismo jugador).
 * Si no completa ninguna, pasa al siguiente jugador en turn_order.
 */
export function drawLine(
  state: PuntosCajasBoardState,
  lineType: 'horizontal' | 'vertical',
  lineIndex: number,
  playerId: string
): PuntosCajasBoardState {
  // 1. Validación: debe ser el turno del jugador
  if (state.turn !== playerId) {
    throw new Error(`No es el turno de ${playerId}; le toca ${state.turn}`);
  }

  // 2. Validación: la línea no debe existir ya
  const lines = lineType === 'horizontal'
    ? state.horizontal_lines
    : state.vertical_lines;

  if (lines[lineIndex]) {
    throw new Error(`La línea ${lineType}${lineIndex + 1} ya está trazada`);
  }

  // 3. Marcar la línea y su dueño (copias inmutables)
  const newH = [...state.horizontal_lines];
  const newV = [...state.vertical_lines];
  const newHOwners = [...state.horizontal_owners];
  const newVOwners = [...state.vertical_owners];
  if (lineType === 'horizontal') {
    newH[lineIndex] = true;
    newHOwners[lineIndex] = playerId;
  } else {
    newV[lineIndex] = true;
    newVOwners[lineIndex] = playerId;
  }

  const N = state.grid_dots;

  // 4. Revisar cajas que esta línea toca (hasta 2 máx.)
  let turnStays = false;
  const newBoxes = [...state.boxes];
  const newScores: Record<string, number> = { ...state.scores };

  if (lineType === 'horizontal') {
    const { row, col } = horizontalLineCoords(N, lineIndex);

    // Caja de arriba (si row > 0): esta línea es la bottom de box (row-1, col)
    if (row > 0) {
      const boxIdx = (row - 1) * (N - 1) + col;
      if (isBoxCompleted(newH, newV, newBoxes, boxIdx, N)) {
        newBoxes[boxIdx] = playerId;
        newScores[playerId] = (newScores[playerId] || 0) + 1;
        turnStays = true;
      }
    }

    // Caja de abajo (si row < N-1): esta línea es la top de box (row, col)
    if (row < N - 1) {
      const boxIdx = row * (N - 1) + col;
      if (isBoxCompleted(newH, newV, newBoxes, boxIdx, N)) {
        newBoxes[boxIdx] = playerId;
        newScores[playerId] = (newScores[playerId] || 0) + 1;
        turnStays = true;
      }
    }
  } else {
    // lineType === 'vertical'
    const { row, col } = verticalLineCoords(N, lineIndex);

    // Caja de la izquierda (si col > 0): esta línea es la right de box (row, col-1)
    if (col > 0) {
      const boxIdx = row * (N - 1) + (col - 1);
      if (isBoxCompleted(newH, newV, newBoxes, boxIdx, N)) {
        newBoxes[boxIdx] = playerId;
        newScores[playerId] = (newScores[playerId] || 0) + 1;
        turnStays = true;
      }
    }

    // Caja de la derecha (si col < N-1): esta línea es la left de box (row, col)
    if (col < N - 1) {
      const boxIdx = row * (N - 1) + col;
      if (isBoxCompleted(newH, newV, newBoxes, boxIdx, N)) {
        newBoxes[boxIdx] = playerId;
        newScores[playerId] = (newScores[playerId] || 0) + 1;
        turnStays = true;
      }
    }
  }

  // 5. Determinar siguiente turno
  const nextTurn = turnStays ? playerId : nextPlayer(state.turn_order, playerId);

  return {
    grid_dots: state.grid_dots,
    horizontal_lines: newH,
    vertical_lines: newV,
    horizontal_owners: newHOwners,
    vertical_owners: newVOwners,
    boxes: newBoxes,
    turn_order: state.turn_order,
    turn: nextTurn,
    turn_started_at: new Date().toISOString(),
    bonus_seconds: 0,
    scores: newScores,
    finished: false,
    winner: null,
  };
}

/** Devuelve el siguiente jugador en orden después de `current`. */
function nextPlayer(turnOrder: string[], current: string): string {
  const idx = turnOrder.indexOf(current);
  if (idx >= 0 && turnOrder.length > idx + 1) {
    return turnOrder[idx + 1];
  }
  return turnOrder[0];
}

/**
 * Pasa el turno al siguiente jugador sin trazar ninguna línea, porque
 * se agotó el temporizador del turno actual. Como compensación, el
 * siguiente jugador arranca su turno con TURN_SECONDS extra.
 */
export function passTurn(state: PuntosCajasBoardState): PuntosCajasBoardState {
  return {
    ...state,
    turn: nextPlayer(state.turn_order, state.turn),
    turn_started_at: new Date().toISOString(),
    bonus_seconds: TURN_SECONDS,
  };
}

/** Verifica si el tablero está lleno (todas las líneas posibles están trazadas). */
export function isBoardFull(state: PuntosCajasBoardState): boolean {
  const N = state.grid_dots;
  const totalHorizontal = N * (N - 1);
  const totalVertical = (N - 1) * N;

  for (let i = 0; i < totalHorizontal; i++) {
    if (!state.horizontal_lines[i]) return false;
  }
  for (let i = 0; i < totalVertical; i++) {
    if (!state.vertical_lines[i]) return false;
  }
  return true;
}

/** Determina el ganador basándose en las puntuaciones. */
export function getWinner(scores: Record<string, number>): string | 'draw' | null {
  if (Object.keys(scores).length === 0) return null;

  const maxScore = Math.max(...Object.values(scores));
  const winners = Object.entries(scores)
    .filter(([, s]) => s === maxScore)
    .map(([id]) => id);

  if (winners.length === 1) {
    return winners[0];
  }
  return 'draw';
}