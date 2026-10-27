import test from 'node:test';
import assert from 'node:assert/strict';
import { COLS, EMPTY_BOARD, dropDisc, hasFour, isDraw } from './gameRules.js';

const index = (row, col) => row * COLS + col;

test('a disc falls to the lowest empty cell in its column', () => {
  let board = EMPTY_BOARD();
  board = dropDisc(board, 3, 1);
  assert.equal(board[index(5, 3)], 1);
  board = dropDisc(board, 3, 2);
  assert.equal(board[index(4, 3)], 2);
});

test('rejects an invalid column and a full column', () => {
  assert.throws(() => dropDisc(EMPTY_BOARD(), 7, 1), /between 0 and 6/);
  let board = EMPTY_BOARD();
  for (let i = 0; i < 6; i += 1) board = dropDisc(board, 0, (i % 2) + 1);
  assert.throws(() => dropDisc(board, 0, 1), /full/);
});

test('finds horizontal, vertical, and both diagonal wins', () => {
  const horizontal = EMPTY_BOARD();
  [0, 1, 2, 3].forEach((c) => { horizontal[index(5, c)] = 1; });
  assert.equal(hasFour(horizontal, 1), true);

  const vertical = EMPTY_BOARD();
  [2, 3, 4, 5].forEach((r) => { vertical[index(r, 2)] = 2; });
  assert.equal(hasFour(vertical, 2), true);

  const diagonalDown = EMPTY_BOARD();
  [[2, 1], [3, 2], [4, 3], [5, 4]].forEach(([r, c]) => { diagonalDown[index(r, c)] = 1; });
  assert.equal(hasFour(diagonalDown, 1), true);

  const diagonalUp = EMPTY_BOARD();
  [[2, 4], [3, 3], [4, 2], [5, 1]].forEach(([r, c]) => { diagonalUp[index(r, c)] = 2; });
  assert.equal(hasFour(diagonalUp, 2), true);
});

test('does not find a win that wraps across rows', () => {
  const board = EMPTY_BOARD();
  [6, 7, 8, 9].forEach((i) => { board[i] = 1; });
  assert.equal(hasFour(board, 1), false);
});

test('recognizes a full drawn board', () => {
  const board = [
    2,1,1,2,1,2,1,
    2,2,1,2,1,2,1,
    2,2,1,1,1,2,1,
    1,1,2,2,2,1,2,
    2,2,1,1,1,2,2,
    1,2,1,2,1,2,2,
  ];
  assert.equal(hasFour(board, 1), false);
  assert.equal(hasFour(board, 2), false);
  assert.equal(isDraw(board), true);
});
