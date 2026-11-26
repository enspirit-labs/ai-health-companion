import { describe, expect, it } from 'vitest';

import type { TangoConstraint } from './daily-pulse-games';
import { nextTangoHint } from './tango-hints';
import type { TangoGrid } from './tango-rules';

function grid(...rows: string[]): TangoGrid {
  return rows.map((row) =>
    [...row].map((ch) => (ch === 'S' ? 'SUN' : ch === 'M' ? 'MOON' : 'EMPTY')),
  );
}

describe('nextTangoHint', () => {
  it('returns null for a full grid', () => {
    expect(nextTangoHint(grid('SMMS', 'MSSM', 'SMSM', 'MSMS'), [], 4)).toBeNull();
  });

  it('uses an = constraint against a filled neighbour, and explains it', () => {
    const constraints: TangoConstraint[] = [{ a: [0, 0], b: [0, 1], type: 'EQUAL' }];
    const hint = nextTangoHint(grid('S...', '....', '....', '....'), constraints, 4);

    expect(hint).not.toBeNull();
    expect(hint!.technique).toBe('CONSTRAINT');
    expect(hint!.cell).toEqual([0, 1]);
    expect(hint!.symbol).toBe('SUN');
    expect(hint!.reason).toMatch(/=/);
    expect(hint!.because).toEqual([[0, 0]]);
  });

  it('uses an × constraint to force the opposite symbol', () => {
    const constraints: TangoConstraint[] = [{ a: [0, 0], b: [0, 1], type: 'OPPOSITE' }];
    const hint = nextTangoHint(grid('S...', '....', '....', '....'), constraints, 4);

    expect(hint!.technique).toBe('CONSTRAINT');
    expect(hint!.cell).toEqual([0, 1]);
    expect(hint!.symbol).toBe('MOON');
  });

  it('works in the other direction across the same constraint', () => {
    const constraints: TangoConstraint[] = [{ a: [0, 0], b: [0, 1], type: 'EQUAL' }];
    const hint = nextTangoHint(grid('.M..', '....', '....', '....'), constraints, 4);

    expect(hint!.cell).toEqual([0, 0]);
    expect(hint!.symbol).toBe('MOON');
  });

  it('blocks a third-in-a-row after an adjacent pair, and cites the pair', () => {
    const hint = nextTangoHint(grid('SS..', '....', '....', '....'), [], 4);

    expect(hint!.technique).toBe('PAIR_BLOCKS');
    expect(hint!.cell).toEqual([0, 2]);
    expect(hint!.symbol).toBe('MOON');
    expect(hint!.because).toEqual([
      [0, 0],
      [0, 1],
    ]);
    expect(hint!.reason).toMatch(/no-three-in-a-row/i);
  });

  it('solves the sandwich pattern (same symbol either side of a gap)', () => {
    // No adjacent pair exists here, so PAIR_BLOCKS cannot fire — isolating SANDWICH.
    const hint = nextTangoHint(grid('S.S.', '....', '....', '....'), [], 4);

    expect(hint!.technique).toBe('SANDWICH');
    expect(hint!.cell).toEqual([0, 1]);
    expect(hint!.symbol).toBe('MOON');
    expect(hint!.reason).toMatch(/three in a row/i);
  });

  it('completes a line whose quota of one symbol is already met', () => {
    // Row 0 has both its moons (4-wide → quota 2) with no pair and no sandwich.
    const hint = nextTangoHint(grid('M..M', '....', '....', '....'), [], 4);

    expect(hint!.technique).toBe('LINE_COMPLETE');
    expect(hint!.symbol).toBe('SUN');
    expect(hint!.reason).toMatch(/row 1/);
  });

  it('marks the final blank in a line as LAST_CELL', () => {
    // Alternating row 0 with a single gap left: no adjacent pair and no
    // sandwich anywhere, so the line-quota deduction is what fires.
    const hint = nextTangoHint(grid('SMS.', '....', '....', '....'), [], 4);

    expect(hint!.cell).toEqual([0, 3]);
    expect(hint!.technique).toBe('LAST_CELL');
    expect(hint!.symbol).toBe('MOON');
  });

  it('never suggests a cell that is already filled', () => {
    const board = grid('SS..', 'M...', '....', '....');
    const hint = nextTangoHint(board, [], 4);
    const [r, c] = hint!.cell;
    expect(board[r][c]).toBe('EMPTY');
  });

  it('falls back to the solution when no deduction applies, and says so', () => {
    // A lone symbol in the middle of an otherwise empty 6x6 forces nothing.
    const board = grid('......', '..S...', '......', '......', '......', '......');
    const solution = grid('SSMMSM', 'MMSSMS', 'SMSMSM', 'MSMSMS', 'SMMSSM', 'MSSMMS');

    const hint = nextTangoHint(board, [], 6, solution);
    expect(hint).not.toBeNull();
    expect(hint!.reason).toMatch(/mistake/i);
  });

  it('returns null with no deduction and no solution supplied', () => {
    const board = grid('......', '..S...', '......', '......', '......', '......');
    expect(nextTangoHint(board, [], 6)).toBeNull();
  });

  it('prefers the constraint deduction over other available techniques', () => {
    // Both an adjacent pair and an = constraint are present; constraint wins.
    const constraints: TangoConstraint[] = [{ a: [3, 3], b: [3, 2], type: 'EQUAL' }];
    const hint = nextTangoHint(grid('SS..', '....', '....', '...M'), constraints, 4);

    expect(hint!.technique).toBe('CONSTRAINT');
    expect(hint!.cell).toEqual([3, 2]);
  });
});
