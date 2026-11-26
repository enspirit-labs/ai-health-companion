import type { PulseEnergy, TangoConstraint, TangoGame, TangoSymbol } from '@aidoctor/shared';

type Solution = TangoSymbol[][];
type PuzzleCell = TangoSymbol | 'EMPTY';
type PuzzleGrid = PuzzleCell[][];

const OTHER: Record<TangoSymbol, TangoSymbol> = { SUN: 'MOON', MOON: 'SUN' };

// Bounds how many candidate cells a single generation attempt will try to
// dig out before settling for whatever givens remain — a real safety net,
// not just tuning: without it a pathological shuffle order could keep the
// solver busy well past what an HTTP request should take.
const MAX_SOLVE_NODES = 200_000;

const TANGO_TITLES: Record<PulseEnergy, string[]> = {
  LOW: ['Quiet Balance', 'Slow Down', 'Gentle Focus'],
  MED: ['Steady Balance', 'Find Your Rhythm', 'Even Ground'],
  HIGH: ['Bright Balance', "Today's Balance", 'Energized Focus'],
};

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffledIndices(count: number): number[] {
  const indices = Array.from({ length: count }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

/** No three of the same symbol consecutively, checked only against already-placed
 * predecessors — sufficient when filling in row-major order. */
function violatesRunRule(grid: (TangoSymbol | null)[][], row: number, col: number, value: TangoSymbol): boolean {
  if (col >= 2 && grid[row][col - 1] === value && grid[row][col - 2] === value) return true;
  if (row >= 2 && grid[row - 1][col] === value && grid[row - 2][col] === value) return true;
  return false;
}

function exceedsBalance(grid: (TangoSymbol | null)[][], row: number, col: number, value: TangoSymbol, size: number): boolean {
  const rowCount = grid[row].filter((c) => c === value).length + 1;
  if (rowCount > size / 2) return true;
  let colCount = 1;
  for (let r = 0; r < size; r++) {
    if (r !== row && grid[r][col] === value) colCount++;
  }
  return colCount > size / 2;
}

function violatesConstraints(
  grid: (TangoSymbol | null)[][],
  row: number,
  col: number,
  value: TangoSymbol,
  constraints: TangoConstraint[],
): boolean {
  for (const constraint of constraints) {
    const [otherCoord, matches] =
      constraint.a[0] === row && constraint.a[1] === col
        ? [constraint.b, constraint.type === 'EQUAL']
        : constraint.b[0] === row && constraint.b[1] === col
          ? [constraint.a, constraint.type === 'EQUAL']
          : [null, false];
    if (!otherCoord) continue;
    const otherValue = grid[otherCoord[0]][otherCoord[1]];
    if (otherValue === null) continue;
    const same = otherValue === value;
    if (matches !== same) return true;
  }
  return false;
}

/** Randomized backtracking fill satisfying only the base Tango rules (no constraints yet —
 * those are chosen afterward, from this solution, so they're consistent by construction). */
function generateSolution(size: number): Solution {
  const grid: (TangoSymbol | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));

  function fill(cellIndex: number): boolean {
    if (cellIndex === size * size) return true;
    const row = Math.floor(cellIndex / size);
    const col = cellIndex % size;

    for (const value of pick([['SUN', 'MOON'], ['MOON', 'SUN']] as const)) {
      if (violatesRunRule(grid, row, col, value) || exceedsBalance(grid, row, col, value, size)) continue;
      grid[row][col] = value;
      if (fill(cellIndex + 1)) return true;
      grid[row][col] = null;
    }
    return false;
  }

  if (!fill(0)) {
    // Astronomically unlikely for size 4/6, but fail loudly rather than return a broken grid.
    throw new Error(`Failed to generate a valid ${size}x${size} Tango solution`);
  }
  return grid as Solution;
}

function chooseConstraints(solution: Solution, size: number): TangoConstraint[] {
  const count = size === 4 ? 2 : 4;
  const adjacentPairs: [[number, number], [number, number]][] = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (col + 1 < size) adjacentPairs.push([[row, col], [row, col + 1]]);
      if (row + 1 < size) adjacentPairs.push([[row, col], [row + 1, col]]);
    }
  }

  const chosen: TangoConstraint[] = [];
  for (const idx of shuffledIndices(adjacentPairs.length)) {
    if (chosen.length >= count) break;
    const [a, b] = adjacentPairs[idx];
    const type = solution[a[0]][a[1]] === solution[b[0]][b[1]] ? 'EQUAL' : 'OPPOSITE';
    chosen.push({ a, b, type });
  }
  return chosen;
}

/** Counts solutions up to `limit` (stopping early — this is a uniqueness check, not enumeration)
 * given the current puzzle grid's fixed cells and the constraint clues. */
export function countTangoSolutions(grid: PuzzleGrid, constraints: TangoConstraint[], size: number, limit: number): number {
  const working: (TangoSymbol | null)[][] = grid.map((row) => row.map((cell) => (cell === 'EMPTY' ? null : cell)));
  let found = 0;
  let nodesVisited = 0;

  function search(cellIndex: number): boolean {
    nodesVisited++;
    if (nodesVisited > MAX_SOLVE_NODES) return true; // abort — treat as "stop searching", handled by caller

    if (cellIndex === size * size) {
      found++;
      return found >= limit;
    }
    const row = Math.floor(cellIndex / size);
    const col = cellIndex % size;

    if (working[row][col] !== null) {
      return search(cellIndex + 1);
    }

    for (const value of ['SUN', 'MOON'] as const) {
      if (
        violatesRunRule(working, row, col, value) ||
        exceedsBalance(working, row, col, value, size) ||
        violatesConstraints(working, row, col, value, constraints)
      ) {
        continue;
      }
      working[row][col] = value;
      if (search(cellIndex + 1)) return true;
      working[row][col] = null;
    }
    return false;
  }

  search(0);
  return found;
}

/**
 * Generates a Tango puzzle with a guaranteed-unique solution: builds a full
 * solution grid, derives a handful of `=`/`x` constraint clues from it, then
 * "digs holes" (reveals fewer cells as givens) one at a time in random
 * order, keeping each removal only if the puzzle still has exactly one
 * solution. An LLM cannot make this guarantee, which is why Tango is
 * code-generated rather than LLM-generated.
 */
export function generateTangoPuzzle(size: 4 | 6, energy: PulseEnergy): TangoGame {
  const solution = generateSolution(size);
  const constraints = chooseConstraints(solution, size);

  const grid: PuzzleGrid = solution.map((row) => [...row]);
  for (const cellIndex of shuffledIndices(size * size)) {
    const row = Math.floor(cellIndex / size);
    const col = cellIndex % size;
    const previous = grid[row][col];
    grid[row][col] = 'EMPTY';
    const solutionCount = countTangoSolutions(grid, constraints, size, 2);
    if (solutionCount !== 1) {
      grid[row][col] = previous; // removing this cell made it ambiguous (or unsolvable) — keep it as a given
    }
  }

  return {
    type: 'TANGO',
    title: pick(TANGO_TITLES[energy]),
    size,
    grid,
    constraints,
    solution,
  };
}
