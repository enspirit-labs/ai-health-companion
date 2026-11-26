import { selectMixedQuota } from './mixed-quota.util';

const byNumberDesc = (a: number, b: number) => b - a;

describe('selectMixedQuota', () => {
  it('takes fullQuota from the first pool and pulseQuota from the second when both are plentiful', () => {
    const full = [10, 9, 8, 7, 6];
    const pulse = [5, 4, 3];

    const result = selectMixedQuota(full, pulse, 3, 2, byNumberDesc);

    expect(result).toEqual([10, 9, 8, 5, 4]);
  });

  it('backfills from the full pool when the pulse pool is scarce', () => {
    const full = [10, 9, 8, 7, 6];
    const pulse = [5];

    const result = selectMixedQuota(full, pulse, 3, 2, byNumberDesc);

    // Only 1 pulse item exists — the missing pulse slot backfills with the
    // next-most-recent full item instead of shrinking the result.
    expect(result).toEqual([10, 9, 8, 7, 5]);
  });

  it('backfills from the pulse pool when the full pool is scarce', () => {
    const full = [10];
    const pulse = [9, 8, 7, 6];

    const result = selectMixedQuota(full, pulse, 3, 2, byNumberDesc);

    // Only 1 full item exists — the 2 missing full slots backfill with the
    // next-most-recent pulse items instead of shrinking the result.
    expect(result).toEqual([10, 9, 8, 7, 6]);
  });

  it('returns everything available, still capped at the total quota, when one pool is empty', () => {
    const full: number[] = [];
    const pulse = [9, 8, 7, 6, 5];

    const result = selectMixedQuota(full, pulse, 3, 2, byNumberDesc);

    expect(result).toEqual([9, 8, 7, 6, 5]);
  });

  it('returns an empty list when both pools are empty', () => {
    expect(selectMixedQuota([], [], 3, 2, byNumberDesc)).toEqual([]);
  });

  it('re-sorts the merged result using the given comparator rather than concatenating pool order', () => {
    const full = [1, 2, 3];
    const pulse = [4, 5];

    const result = selectMixedQuota(full, pulse, 3, 2, byNumberDesc);

    expect(result).toEqual([5, 4, 3, 2, 1]);
  });
});
