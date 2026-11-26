import type { TangoConstraint, TangoSymbol } from './daily-pulse-games';

export type TangoCell = TangoSymbol | 'EMPTY';
export type TangoGrid = TangoCell[][];
export type Coord = [number, number];

export const TANGO_RULES = ['ADJACENCY', 'BALANCE', 'CONSTRAINT'] as const;
export type TangoRule = (typeof TANGO_RULES)[number];

export interface TangoViolation {
  rule: TangoRule;
  /** Exactly the cells to highlight — the offending run/line/pair, not the whole grid. */
  cells: Coord[];
  /** Player-facing explanation of the rule that was broken. */
  message: string;
}

/**
 * Player-facing rule copy. Kept as one map so the wording stays identical
 * between the live violation banner and the how-to-play list — two places
 * drifting apart is exactly how a puzzle starts feeling unfair.
 */
export const TANGO_RULE_MESSAGES: Record<TangoRule, string> = {
  ADJACENCY: 'Only 2 suns or moons can touch, either vertically or horizontally.',
  BALANCE: 'Each row and column must have the same number of suns and moons.',
  CONSTRAINT: 'Cells joined by = must match, and cells joined by × must differ.',
};

const OPPOSITE: Record<TangoSymbol, TangoSymbol> = { SUN: 'MOON', MOON: 'SUN' };

export function oppositeOf(symbol: TangoSymbol): TangoSymbol {
  return OPPOSITE[symbol];
}

function countIn(line: TangoCell[], value: TangoSymbol): number {
  return line.filter((cell) => cell === value).length;
}

function column(grid: TangoGrid, col: number): TangoCell[] {
  return grid.map((row) => row[col]);
}

/**
 * Runs of 3+ identical symbols, horizontally and vertically. Reported as the
 * whole run rather than just the offending third cell — the player needs to
 * see which group is wrong, not guess which single cell to change.
 */
function adjacencyViolations(grid: TangoGrid, size: number): TangoViolation[] {
  const violations: TangoViolation[] = [];

  const scan = (getCell: (i: number) => TangoCell, toCoord: (i: number) => Coord) => {
    let runStart = 0;
    for (let i = 1; i <= size; i++) {
      const prev = getCell(i - 1);
      const current = i < size ? getCell(i) : 'EMPTY';
      const continues = i < size && current === prev && prev !== 'EMPTY';
      if (continues) continue;

      const runLength = i - runStart;
      if (prev !== 'EMPTY' && runLength >= 3) {
        violations.push({
          rule: 'ADJACENCY',
          cells: Array.from({ length: runLength }, (_, k) => toCoord(runStart + k)),
          message: TANGO_RULE_MESSAGES.ADJACENCY,
        });
      }
      runStart = i;
    }
  };

  for (let r = 0; r < size; r++) {
    scan(
      (c) => grid[r][c],
      (c) => [r, c],
    );
  }
  for (let c = 0; c < size; c++) {
    scan(
      (r) => grid[r][c],
      (r) => [r, c],
    );
  }

  return violations;
}

/**
 * A row/column is only *wrong* once it holds more than half of one symbol —
 * a half-filled line isn't an error, it's an unfinished line. Flagging those
 * early would light the board up red while the player is still thinking.
 */
function balanceViolations(grid: TangoGrid, size: number): TangoViolation[] {
  const violations: TangoViolation[] = [];
  const half = size / 2;

  for (let r = 0; r < size; r++) {
    const line = grid[r];
    for (const symbol of ['SUN', 'MOON'] as const) {
      if (countIn(line, symbol) > half) {
        violations.push({
          rule: 'BALANCE',
          cells: line.flatMap((cell, c): Coord[] => (cell === symbol ? [[r, c]] : [])),
          message: TANGO_RULE_MESSAGES.BALANCE,
        });
      }
    }
  }

  for (let c = 0; c < size; c++) {
    const line = column(grid, c);
    for (const symbol of ['SUN', 'MOON'] as const) {
      if (countIn(line, symbol) > half) {
        violations.push({
          rule: 'BALANCE',
          cells: line.flatMap((cell, r): Coord[] => (cell === symbol ? [[r, c]] : [])),
          message: TANGO_RULE_MESSAGES.BALANCE,
        });
      }
    }
  }

  return violations;
}

/** Only judged once both ends of the pair are filled — a half-filled pair is undecided, not wrong. */
function constraintViolations(grid: TangoGrid, constraints: TangoConstraint[]): TangoViolation[] {
  return constraints.flatMap((constraint): TangoViolation[] => {
    const [ar, ac] = constraint.a;
    const [br, bc] = constraint.b;
    const a = grid[ar]?.[ac];
    const b = grid[br]?.[bc];
    if (!a || !b || a === 'EMPTY' || b === 'EMPTY') return [];

    const satisfied = constraint.type === 'EQUAL' ? a === b : a !== b;
    if (satisfied) return [];

    return [
      {
        rule: 'CONSTRAINT',
        cells: [constraint.a, constraint.b],
        message:
          constraint.type === 'EQUAL'
            ? 'Cells joined by = must be the same type.'
            : 'Cells joined by × must be opposite types.',
      },
    ];
  });
}

/**
 * The whole real-time validation surface: every rule currently broken by the
 * board as it stands. Deliberately reports *nothing* for a merely-incomplete
 * board, so the player is only ever interrupted by an actual mistake (this is
 * what lets the UI drop a "Check answer" button entirely).
 */
export function validateTangoGrid(
  grid: TangoGrid,
  constraints: TangoConstraint[],
  size: number,
): TangoViolation[] {
  return [
    ...adjacencyViolations(grid, size),
    ...balanceViolations(grid, size),
    ...constraintViolations(grid, constraints),
  ];
}

/** Flattened set of "r,c" keys for O(1) per-cell highlight lookups while rendering. */
export function violatingCellKeys(violations: TangoViolation[]): Set<string> {
  const keys = new Set<string>();
  for (const violation of violations) {
    for (const [r, c] of violation.cells) keys.add(`${r},${c}`);
  }
  return keys;
}

export function isTangoGridFull(grid: TangoGrid): boolean {
  return grid.every((row) => row.every((cell) => cell !== 'EMPTY'));
}

/**
 * Solved means full *and* rule-clean — deliberately not "matches the stored
 * solution". Tango puzzles are generated with a unique solution, so a
 * rule-clean full board is that solution; checking rules instead means the
 * win state is explained by the same logic the player was following.
 */
export function isTangoSolved(grid: TangoGrid, constraints: TangoConstraint[], size: number): boolean {
  return isTangoGridFull(grid) && validateTangoGrid(grid, constraints, size).length === 0;
}
