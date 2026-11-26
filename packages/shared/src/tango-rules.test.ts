import { describe, expect, it } from 'vitest';

import type { TangoConstraint } from './daily-pulse-games';
import {
  isTangoSolved,
  validateTangoGrid,
  violatingCellKeys,
  type TangoGrid,
} from './tango-rules';

/** Compact fixture helper: 'S' sun, 'M' moon, '.' empty. */
function grid(...rows: string[]): TangoGrid {
  return rows.map((row) =>
    [...row].map((ch) => (ch === 'S' ? 'SUN' : ch === 'M' ? 'MOON' : 'EMPTY')),
  );
}

const SOLVED_4 = grid('SMMS', 'MSSM', 'SMSM', 'MSMS');

describe('validateTangoGrid', () => {
  it('reports nothing for an empty board — an unfinished puzzle is not a mistake', () => {
    expect(validateTangoGrid(grid('....', '....', '....', '....'), [], 4)).toEqual([]);
  });

  it('reports nothing for a valid solved board', () => {
    expect(validateTangoGrid(SOLVED_4, [], 4)).toEqual([]);
  });

  it('flags three in a row horizontally, highlighting the whole run', () => {
    const violations = validateTangoGrid(grid('SSS.', '....', '....', '....'), [], 4);
    const adjacency = violations.filter((v) => v.rule === 'ADJACENCY');
    expect(adjacency).toHaveLength(1);
    expect(adjacency[0].cells).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
    ]);
    expect(adjacency[0].message).toMatch(/only 2/i);
  });

  it('flags three in a row vertically', () => {
    const violations = validateTangoGrid(grid('M...', 'M...', 'M...', '....'), [], 4);
    const adjacency = violations.filter((v) => v.rule === 'ADJACENCY');
    expect(adjacency).toHaveLength(1);
    expect(adjacency[0].cells).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
    ]);
  });

  it('does not flag only two adjacent identical symbols', () => {
    expect(validateTangoGrid(grid('SS..', '....', '....', '....'), [], 4)).toEqual([]);
  });

  it('flags a row holding more than half of one symbol', () => {
    const violations = validateTangoGrid(grid('S.SS', '....', '....', '....'), [], 4);
    expect(violations.some((v) => v.rule === 'BALANCE')).toBe(true);
  });

  it('does not flag a half-filled line that is still winnable', () => {
    // Two suns in a 4-wide row is exactly the quota — not yet an error.
    expect(validateTangoGrid(grid('S.S.', '....', '....', '....'), [], 4)).toEqual([]);
  });

  it('flags a column holding more than half of one symbol', () => {
    const violations = validateTangoGrid(grid('M...', 'M...', '....', 'M...'), [], 4);
    expect(violations.some((v) => v.rule === 'BALANCE')).toBe(true);
  });

  describe('=/× constraints', () => {
    const equal: TangoConstraint[] = [{ a: [0, 0], b: [0, 1], type: 'EQUAL' }];
    const opposite: TangoConstraint[] = [{ a: [0, 0], b: [0, 1], type: 'OPPOSITE' }];

    it('flags an = pair that differs', () => {
      const violations = validateTangoGrid(grid('SM..', '....', '....', '....'), equal, 4);
      const constraint = violations.filter((v) => v.rule === 'CONSTRAINT');
      expect(constraint).toHaveLength(1);
      expect(constraint[0].cells).toEqual([
        [0, 0],
        [0, 1],
      ]);
    });

    it('accepts an = pair that matches', () => {
      expect(validateTangoGrid(grid('SS..', '....', '....', '....'), equal, 4)).toEqual([]);
    });

    it('flags an × pair that matches', () => {
      const violations = validateTangoGrid(grid('SS..', '....', '....', '....'), opposite, 4);
      expect(violations.some((v) => v.rule === 'CONSTRAINT')).toBe(true);
    });

    it('accepts an × pair that differs', () => {
      expect(validateTangoGrid(grid('SM..', '....', '....', '....'), opposite, 4)).toEqual([]);
    });

    it('stays silent while only one end of the pair is filled', () => {
      expect(validateTangoGrid(grid('S...', '....', '....', '....'), equal, 4)).toEqual([]);
      expect(validateTangoGrid(grid('S...', '....', '....', '....'), opposite, 4)).toEqual([]);
    });
  });
});

describe('violatingCellKeys', () => {
  it('flattens every violation into r,c lookup keys', () => {
    const violations = validateTangoGrid(grid('SSS.', '....', '....', '....'), [], 4);
    const keys = violatingCellKeys(violations);
    expect(keys.has('0,0')).toBe(true);
    expect(keys.has('0,2')).toBe(true);
    expect(keys.has('0,3')).toBe(false);
  });
});

describe('isTangoSolved', () => {
  it('is true for a full, rule-clean board', () => {
    expect(isTangoSolved(SOLVED_4, [], 4)).toBe(true);
  });

  it('is false while any cell is empty', () => {
    expect(isTangoSolved(grid('SMMS', 'MSSM', 'SMSM', 'MSM.'), [], 4)).toBe(false);
  });

  it('is false for a full board that breaks a rule', () => {
    expect(isTangoSolved(grid('SSSM', 'MSSM', 'SMSM', 'MSMS'), [], 4)).toBe(false);
  });

  it('is false for a full board that breaks a constraint', () => {
    const opposite: TangoConstraint[] = [{ a: [0, 0], b: [0, 1], type: 'OPPOSITE' }];
    expect(isTangoSolved(grid('SSMM', 'MMSS', 'SSMM', 'MMSS'), opposite, 4)).toBe(false);
  });
});
