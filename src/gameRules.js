// Pure helpers used by the test suite to check the board conventions used by the SQL game engine.
// The database RPC is authoritative during actual online play.
export const ROWS = 6;
export const COLS = 7;
export const EMPTY_BOARD = () => Array(ROWS * COLS).fill(0);

export function dropDisc(board, column, piece) {
  if (!Array.isArray(board) || board.length !== ROWS * COLS) throw new Error('Board must have 42 cells.');
  if (!Number.isInteger(column) || column < 0 || column >= COLS) throw new Error('Column must be between 0 and 6.');
  if (piece !== 1 && piece !== 2) throw new Error('Piece must be 1 or 2.');
  const next = [...board];
  for (let row = ROWS - 1; row >= 0; row -= 1) {
    const index = row * COLS + column;
    if (next[index] === 0) {
      next[index] = piece;
      return next;
    }
  }
  throw new Error('That column is full.');
}

export function hasFour(board, piece) {
  const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      if (board[row * COLS + col] !== piece) continue;
      for (const [dr, dc] of directions) {
        let matches = true;
        for (let step = 1; step < 4; step += 1) {
          const r = row + dr * step;
          const c = col + dc * step;
          if (r < 0 || r >= ROWS || c < 0 || c >= COLS || board[r * COLS + c] !== piece) {
            matches = false;
            break;
          }
        }
        if (matches) return true;
      }
    }
  }
  return false;
}

export const isDraw = (board) => board.length === ROWS * COLS && board.every((cell) => cell !== 0) && !hasFour(board, 1) && !hasFour(board, 2);
