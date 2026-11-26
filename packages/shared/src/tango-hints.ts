import type { TangoConstraint, TangoSymbol } from './daily-pulse-games';
import { oppositeOf, type Coord, type TangoGrid } from './tango-rules';

export const HINT_TECHNIQUES = [
  'CONSTRAINT',
  'PAIR_BLOCKS',
  'SANDWICH',
  'LINE_COMPLETE',
  'LAST_CELL',
] as const;
export type HintTechnique = (typeof HINT_TECHNIQUES)[number];

export interface TangoHint {
  cell: Coord;
  symbol: TangoSymbol;
  technique: HintTechnique;
  /** One-line, second-person explanation of the deduction — the teaching payload. */
  reason: string;
  /** Cells that make the deduction work, highlighted alongside the target cell. */
  because: Coord[];
}

const LABEL: Record<TangoSymbol, string> = { SUN: 'sun', MOON: 'moon' };

function inBounds(size: number, r: number, c: number): boolean {
  return r >= 0 && r < size && c >= 0 && c < size;
}

function isEmpty(grid: TangoGrid, r: number, c: number): boolean {
  return grid[r]?.[c] === 'EMPTY';
}

/**
 * A filled neighbour across a =/× clue forces this cell outright — the most
 * concrete deduction there is, so it's offered first: the player can see both
 * cells and the sign joining them without scanning anything else.
 */
function constraintHint(grid: TangoGrid, constraints: TangoConstraint[]): TangoHint | null {
  for (const constraint of constraints) {
    const pairs: [Coord, Coord][] = [
      [constraint.a, constraint.b],
      [constraint.b, constraint.a],
    ];
    for (const [target, source] of pairs) {
      const [tr, tc] = target;
      const [sr, sc] = source;
      const sourceValue = grid[sr]?.[sc];
      if (!isEmpty(grid, tr, tc) || !sourceValue || sourceValue === 'EMPTY') continue;

      const symbol = constraint.type === 'EQUAL' ? sourceValue : oppositeOf(sourceValue);
      const sign = constraint.type === 'EQUAL' ? '=' : '×';
      const relation = constraint.type === 'EQUAL' ? 'must match it' : 'must be the opposite';
      return {
        cell: target,
        symbol,
        technique: 'CONSTRAINT',
        reason: `This cell is joined by ${sign} to a ${LABEL[sourceValue]}, so it ${relation} — it has to be a ${LABEL[symbol]}.`,
        because: [source],
      };
    }
  }
  return null;
}

/**
 * Two identical symbols side by side force the opposite at both open ends,
 * because a third in a row is illegal.
 */
function pairBlocksHint(grid: TangoGrid, size: number): TangoHint | null {
  const directions: [number, number][] = [
    [0, 1],
    [1, 0],
  ];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const value = grid[r][c];
      if (value === 'EMPTY') continue;

      for (const [dr, dc] of directions) {
        const nr = r + dr;
        const nc = c + dc;
        if (!inBounds(size, nr, nc) || grid[nr][nc] !== value) continue;

        // Both open ends of the pair are forced to the opposite symbol.
        const ends: Coord[] = [
          [r - dr, c - dc],
          [nr + dr, nc + dc],
        ];
        for (const [er, ec] of ends) {
          if (!inBounds(size, er, ec) || !isEmpty(grid, er, ec)) continue;
          const symbol = oppositeOf(value);
          const axis = dc === 1 ? 'across' : 'down';
          return {
            cell: [er, ec],
            symbol,
            technique: 'PAIR_BLOCKS',
            reason: `Two ${LABEL[value]}s already sit together ${axis} here. A third would break the no-three-in-a-row rule, so this cell must be a ${LABEL[symbol]}.`,
            because: [
              [r, c],
              [nr, nc],
            ],
          };
        }
      }
    }
  }
  return null;
}

/**
 * The X_X pattern: a gap flanked by the same symbol on both sides must take
 * the opposite, or the filled gap would make three in a row.
 */
function sandwichHint(grid: TangoGrid, size: number): TangoHint | null {
  const directions: [number, number][] = [
    [0, 1],
    [1, 0],
  ];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!isEmpty(grid, r, c)) continue;

      for (const [dr, dc] of directions) {
        const before: Coord = [r - dr, c - dc];
        const after: Coord = [r + dr, c + dc];
        if (!inBounds(size, ...before) || !inBounds(size, ...after)) continue;

        const a = grid[before[0]][before[1]];
        const b = grid[after[0]][after[1]];
        if (a === 'EMPTY' || a !== b) continue;

        const symbol = oppositeOf(a);
        const axis = dc === 1 ? 'either side' : 'above and below';
        return {
          cell: [r, c],
          symbol,
          technique: 'SANDWICH',
          reason: `There's a ${LABEL[a]} on ${axis} of this cell. Filling it with a ${LABEL[a]} would make three in a row, so it must be a ${LABEL[symbol]}.`,
          because: [before, after],
        };
      }
    }
  }
  return null;
}

/**
 * A row/column that already holds its full quota of one symbol has every
 * remaining blank forced to the other.
 */
function lineCompleteHint(grid: TangoGrid, size: number): TangoHint | null {
  const half = size / 2;

  const scan = (
    lineCells: Coord[],
    orientation: 'row' | 'column',
    index: number,
  ): TangoHint | null => {
    const values = lineCells.map(([r, c]) => grid[r][c]);
    for (const symbol of ['SUN', 'MOON'] as const) {
      if (values.filter((v) => v === symbol).length !== half) continue;

      const blankIndex = values.findIndex((v) => v === 'EMPTY');
      if (blankIndex === -1) continue;

      const forced = oppositeOf(symbol);
      const blanksLeft = values.filter((v) => v === 'EMPTY').length;
      return {
        cell: lineCells[blankIndex],
        symbol: forced,
        technique: blanksLeft === 1 ? 'LAST_CELL' : 'LINE_COMPLETE',
        reason: `This ${orientation} already has all ${half} of its ${LABEL[symbol]}s, so every remaining cell in ${orientation} ${index + 1} must be a ${LABEL[forced]}.`,
        because: lineCells.filter(([r, c]) => grid[r][c] === symbol),
      };
    }
    return null;
  };

  for (let r = 0; r < size; r++) {
    const hint = scan(
      Array.from({ length: size }, (_, c): Coord => [r, c]),
      'row',
      r,
    );
    if (hint) return hint;
  }
  for (let c = 0; c < size; c++) {
    const hint = scan(
      Array.from({ length: size }, (_, r): Coord => [r, c]),
      'column',
      c,
    );
    if (hint) return hint;
  }
  return null;
}

/**
 * Next single move the player could have worked out for themselves, with the
 * reasoning attached. Techniques are tried easiest-to-explain first so the
 * hint teaches a repeatable tactic rather than just filling a square.
 *
 * Falls back to the stored solution only if no technique applies (which
 * happens when the board already contains a mistake — the deductions above
 * all assume a consistent board). Returns null when the grid is full.
 */
export function nextTangoHint(
  grid: TangoGrid,
  constraints: TangoConstraint[],
  size: number,
  solution?: TangoGrid,
): TangoHint | null {
  const deduced =
    constraintHint(grid, constraints) ??
    pairBlocksHint(grid, size) ??
    sandwichHint(grid, size) ??
    lineCompleteHint(grid, size);
  if (deduced) return deduced;

  if (!solution) return null;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const answer = solution[r]?.[c];
      if (!isEmpty(grid, r, c) || !answer || answer === 'EMPTY') continue;
      return {
        cell: [r, c],
        symbol: answer,
        technique: 'LAST_CELL',
        reason: `Nothing else on the board forces a move right now — there may be a mistake earlier. This cell should be a ${LABEL[answer]}.`,
        because: [],
      };
    }
  }
  return null;
}
