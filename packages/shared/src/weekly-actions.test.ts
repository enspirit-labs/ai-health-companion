import { describe, expect, it } from 'vitest';
import { PERSONAL_GOALS } from './goals';
import {
  getWeeklyActionDef,
  isoWeekStartKey,
  selectWeeklyActions,
  WEEKLY_ACTION_CATALOGUE,
  WeeklyActionsQuerySchema,
} from './weekly-actions';

describe('WEEKLY_ACTION_CATALOGUE', () => {
  it('has unique ids and 3 standard + 2 light actions per goal', () => {
    const ids = WEEKLY_ACTION_CATALOGUE.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const goal of PERSONAL_GOALS) {
      const forGoal = WEEKLY_ACTION_CATALOGUE.filter((a) => a.goal === goal);
      expect(forGoal.filter((a) => a.weight === 'STANDARD')).toHaveLength(3);
      expect(forGoal.filter((a) => a.weight === 'LIGHT')).toHaveLength(2);
    }
  });
});

describe('selectWeeklyActions', () => {
  it('offers three standard actions for a single goal', () => {
    const actions = selectWeeklyActions(['SLEEP'], false);
    expect(actions).toHaveLength(3);
    expect(actions.every((a) => a.goal === 'SLEEP' && a.weight === 'STANDARD')).toBe(true);
  });

  it('shares three actions across two goals', () => {
    const actions = selectWeeklyActions(['SLEEP', 'MOVEMENT'], false);
    expect(actions.map((a) => a.goal)).toEqual(['SLEEP', 'MOVEMENT', 'SLEEP']);
  });

  it('offers two lighter actions after a lapse', () => {
    const actions = selectWeeklyActions(['STRESS'], true);
    expect(actions).toHaveLength(2);
    expect(actions.every((a) => a.weight === 'LIGHT')).toBe(true);
  });

  it('offers nothing without goals', () => {
    expect(selectWeeklyActions([], false)).toEqual([]);
  });
});

describe('isoWeekStartKey', () => {
  it('returns the Monday of the week for any day', () => {
    expect(isoWeekStartKey(new Date('2026-10-28T10:00:00Z'))).toBe('2026-10-26');
    expect(isoWeekStartKey(new Date('2026-10-26T00:00:00Z'))).toBe('2026-10-26');
    expect(isoWeekStartKey(new Date('2026-11-01T23:59:59Z'))).toBe('2026-10-26');
  });

  it('crosses month and year boundaries', () => {
    expect(isoWeekStartKey(new Date('2027-01-01T12:00:00Z'))).toBe('2026-12-28');
  });
});

describe('WeeklyActionsQuerySchema / getWeeklyActionDef', () => {
  it('defaults lapsed to false', () => {
    expect(WeeklyActionsQuerySchema.parse({}).lapsed).toBe(false);
    expect(WeeklyActionsQuerySchema.parse({ lapsed: 'true' }).lapsed).toBe(true);
  });

  it('looks up catalogue entries by id', () => {
    expect(getWeeklyActionDef('sleep-wind-down')?.goal).toBe('SLEEP');
    expect(getWeeklyActionDef('nope')).toBeUndefined();
  });
});
