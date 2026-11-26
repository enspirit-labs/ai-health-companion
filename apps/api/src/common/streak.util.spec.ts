import { computeCurrentStreak, STREAK_GRACE_DAYS } from './streak.util';

describe('computeCurrentStreak', () => {
  it('uses one grace day', () => {
    expect(STREAK_GRACE_DAYS).toBe(1);
  });

  it('returns 0, not lapsed, for a brand-new user with no completions', () => {
    expect(computeCurrentStreak(new Set(), '2026-01-16')).toEqual({
      currentStreak: 0,
      completedToday: false,
      totalActiveDays: 0,
      lapsed: false,
    });
  });

  it('counts a single day completed today', () => {
    expect(computeCurrentStreak(new Set(['2026-01-16']), '2026-01-16')).toEqual({
      currentStreak: 1,
      completedToday: true,
      totalActiveDays: 1,
      lapsed: false,
    });
  });

  it('counts 3 consecutive days ending today', () => {
    const days = new Set(['2026-01-14', '2026-01-15', '2026-01-16']);
    expect(computeCurrentStreak(days, '2026-01-16')).toEqual({
      currentStreak: 3,
      completedToday: true,
      totalActiveDays: 3,
      lapsed: false,
    });
  });

  it('stays alive through yesterday when today has nothing yet', () => {
    const days = new Set(['2026-01-14', '2026-01-15']);
    expect(computeCurrentStreak(days, '2026-01-16')).toEqual({
      currentStreak: 2,
      completedToday: false,
      totalActiveDays: 2,
      lapsed: false,
    });
  });

  it('stays alive when yesterday was missed (one grace day) and today is still open', () => {
    const days = new Set(['2026-01-13', '2026-01-14']);
    expect(computeCurrentStreak(days, '2026-01-16')).toMatchObject({
      currentStreak: 2,
      completedToday: false,
      lapsed: false,
    });
  });

  it('breaks and flags lapsed when two full days were missed', () => {
    const days = new Set(['2026-01-12', '2026-01-13']);
    expect(computeCurrentStreak(days, '2026-01-16')).toEqual({
      currentStreak: 0,
      completedToday: false,
      totalActiveDays: 2,
      lapsed: true,
    });
  });

  it('a single missed day inside a run does not break it or count toward it', () => {
    // 14th missing — tolerated; 4 active days make a 4-day streak.
    const days = new Set(['2026-01-12', '2026-01-13', '2026-01-15', '2026-01-16']);
    expect(computeCurrentStreak(days, '2026-01-16')).toEqual({
      currentStreak: 4,
      completedToday: true,
      totalActiveDays: 4,
      lapsed: false,
    });
  });

  it('two consecutive missed days inside a run truncate it', () => {
    const days = new Set(['2026-01-11', '2026-01-12', '2026-01-15', '2026-01-16']);
    expect(computeCurrentStreak(days, '2026-01-16')).toEqual({
      currentStreak: 2,
      completedToday: true,
      totalActiveDays: 4,
      lapsed: false,
    });
  });

  it('a completion 40 days stale with nothing since is lapsed, total preserved', () => {
    expect(computeCurrentStreak(new Set(['2025-12-07']), '2026-01-16')).toEqual({
      currentStreak: 0,
      completedToday: false,
      totalActiveDays: 1,
      lapsed: true,
    });
  });

  it('returns to a normal state (not lapsed) once the user checks in again', () => {
    const days = new Set(['2025-12-07', '2026-01-16']);
    expect(computeCurrentStreak(days, '2026-01-16')).toEqual({
      currentStreak: 1,
      completedToday: true,
      totalActiveDays: 2,
      lapsed: false,
    });
  });

  it('crosses a month/year boundary correctly', () => {
    const days = new Set(['2025-12-31', '2026-01-01', '2026-01-02']);
    expect(computeCurrentStreak(days, '2026-01-02')).toEqual({
      currentStreak: 3,
      completedToday: true,
      totalActiveDays: 3,
      lapsed: false,
    });
  });

  it('tolerates a missed day across a month boundary', () => {
    const days = new Set(['2025-12-30', '2026-01-01']);
    expect(computeCurrentStreak(days, '2026-01-01')).toMatchObject({ currentStreak: 2, lapsed: false });
  });
});
