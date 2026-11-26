import {
  addDays,
  computeLapseRecovery,
  computeRetention,
  daysBetween,
  streakBucket,
  weekStartOf,
} from './pilot-metrics.util';

const user = (signupKey: string, days: string[]) => ({
  signupKey,
  dayKeys: new Set(days),
});

describe('pilot-metrics.util', () => {
  describe('date helpers', () => {
    it('adds and measures days across month boundaries', () => {
      expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
      expect(daysBetween('2026-10-30', '2026-11-02')).toBe(3);
    });

    it('finds the Monday of the week', () => {
      expect(weekStartOf('2026-10-28')).toBe('2026-10-26'); // Wednesday
      expect(weekStartOf('2026-11-01')).toBe('2026-10-26'); // Sunday
      expect(weekStartOf('2026-10-26')).toBe('2026-10-26'); // Monday
    });
  });

  describe('computeRetention', () => {
    const today = '2026-11-01';

    it('counts a user retained only if active on exactly signup + n', () => {
      const users = [
        user('2026-10-20', ['2026-10-21']),
        user('2026-10-20', ['2026-10-22']),
      ];
      expect(computeRetention(users, today, 1)).toEqual({
        day: 1,
        eligibleUsers: 2,
        retainedUsers: 1,
        rate: 0.5,
      });
    });

    it('excludes users whose Dn is still in the future', () => {
      const users = [
        user('2026-10-30', ['2026-10-31']),
        user('2026-10-01', ['2026-10-15']),
      ];
      const d7 = computeRetention(users, today, 7);
      expect(d7.eligibleUsers).toBe(1);
      expect(d7.retainedUsers).toBe(0);
    });

    it('returns a null rate when nobody is eligible', () => {
      expect(
        computeRetention([user('2026-11-01', [])], today, 14).rate,
      ).toBeNull();
    });
  });

  describe('computeLapseRecovery', () => {
    const today = '2026-11-20';

    it('does not treat a single missed day as a lapse', () => {
      const r = computeLapseRecovery(
        [user('2026-10-01', ['2026-10-01', '2026-10-03'])],
        '2026-10-04',
      );
      expect(r).toEqual({ lapsedUsers: 0, recoveredUsers: 0, rate: null });
    });

    it('counts a gap of two missed days that ends in a return within 7 days as recovered', () => {
      const r = computeLapseRecovery(
        [user('2026-10-01', ['2026-10-01', '2026-10-04'])],
        today,
      );
      expect(r).toEqual({ lapsedUsers: 1, recoveredUsers: 1, rate: 1 });
    });

    it('counts a return later than 7 days after the lapse as not recovered', () => {
      const r = computeLapseRecovery(
        [user('2026-10-01', ['2026-10-01', '2026-10-15'])],
        today,
      );
      expect(r).toEqual({ lapsedUsers: 1, recoveredUsers: 0, rate: 0 });
    });

    it('counts a user who never returned once the window has closed', () => {
      const r = computeLapseRecovery(
        [user('2026-10-01', ['2026-10-01'])],
        today,
      );
      expect(r).toEqual({ lapsedUsers: 1, recoveredUsers: 0, rate: 0 });
    });

    it('leaves out a lapse whose recovery window is still open', () => {
      const r = computeLapseRecovery(
        [user('2026-11-10', ['2026-11-10'])],
        '2026-11-14',
      );
      expect(r.lapsedUsers).toBe(0);
    });

    it('judges each user on their first lapse only', () => {
      const days = ['2026-10-01', '2026-10-04', '2026-10-20'];
      expect(computeLapseRecovery([user('2026-10-01', days)], today)).toEqual({
        lapsedUsers: 1,
        recoveredUsers: 1,
        rate: 1,
      });
    });

    it('computes a share across users', () => {
      const r = computeLapseRecovery(
        [
          user('2026-10-01', ['2026-10-01', '2026-10-05']),
          user('2026-10-01', ['2026-10-01', '2026-10-17']),
        ],
        today,
      );
      expect(r).toEqual({ lapsedUsers: 2, recoveredUsers: 1, rate: 0.5 });
    });
  });

  describe('streakBucket', () => {
    it('buckets by current streak and flags lapsed users', () => {
      const today = '2026-11-10';
      expect(streakBucket(new Set(), today)).toBe('NONE');
      expect(streakBucket(new Set(['2026-10-01']), today)).toBe('LAPSED');
      expect(streakBucket(new Set(['2026-11-10']), today)).toBe('1-2');
      expect(
        streakBucket(
          new Set(['2026-11-08', '2026-11-09', '2026-11-10']),
          today,
        ),
      ).toBe('3-6');
    });
  });
});
