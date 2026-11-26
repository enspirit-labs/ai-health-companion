import {
  PILOT_LAPSE_MIN_GAP_DAYS,
  PILOT_LAPSE_RECOVERY_DAYS,
  type StreakBucket,
} from '@aidoctor/shared';

import { computeCurrentStreak } from '../common/streak.util';

/** One cohort user's check-in history, already bucketed to calendar-day keys in their own timezone. */
export interface UserDays {
  signupKey: string;
  dayKeys: Set<string>;
}

/** Whole days from `from` to `to` ("YYYY-MM-DD" keys); negative if `to` is earlier. Calendar arithmetic only. */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000,
  );
}

export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Monday (UTC calendar) of the week containing `key`. */
export function weekStartOf(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(key, -((dow + 6) % 7));
}

export function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

/**
 * Dn retention: of users whose Dn has already happened (signup day + n is not
 * in the future), the share with a check-in on exactly that day. Day 0 is the
 * signup day in the user's own timezone.
 */
export function computeRetention(
  users: UserDays[],
  todayKey: string,
  day: number,
) {
  let eligibleUsers = 0;
  let retainedUsers = 0;
  for (const u of users) {
    const target = addDays(u.signupKey, day);
    if (target > todayKey) continue;
    eligibleUsers += 1;
    if (u.dayKeys.has(target)) retainedUsers += 1;
  }
  return {
    day,
    eligibleUsers,
    retainedUsers,
    rate: rate(retainedUsers, eligibleUsers),
  };
}

/**
 * Lapse recovery. A lapse is PILOT_LAPSE_MIN_GAP_DAYS consecutive days with no
 * check-in after an active day; its start is the last of those missed days. A
 * user's first lapse counts as recovered if they check in within
 * PILOT_LAPSE_RECOVERY_DAYS of that start. A lapse whose window is still open
 * (not recovered, not yet 7 days on) is left out rather than counted as a miss.
 */
export function computeLapseRecovery(users: UserDays[], todayKey: string) {
  let lapsedUsers = 0;
  let recoveredUsers = 0;
  for (const u of users) {
    const days = [...u.dayKeys].sort();
    for (let i = 0; i < days.length; i += 1) {
      const prev = days[i];
      const next = days[i + 1] as string | undefined;
      const lapseStart = addDays(prev, PILOT_LAPSE_MIN_GAP_DAYS);
      const windowEnd = addDays(lapseStart, PILOT_LAPSE_RECOVERY_DAYS);
      if (next !== undefined) {
        if (next <= lapseStart) continue; // fewer than two missed days: not a lapse
        lapsedUsers += 1;
        if (next <= windowEnd) recoveredUsers += 1;
        break;
      }
      if (todayKey > windowEnd) lapsedUsers += 1; // never came back and the window closed
      break;
    }
  }
  return {
    lapsedUsers,
    recoveredUsers,
    rate: rate(recoveredUsers, lapsedUsers),
  };
}

export function streakBucket(
  dayKeys: Set<string>,
  todayKey: string,
): StreakBucket {
  const { currentStreak, lapsed } = computeCurrentStreak(dayKeys, todayKey);
  if (lapsed) return 'LAPSED';
  if (currentStreak === 0) return 'NONE';
  if (currentStreak <= 2) return '1-2';
  if (currentStreak <= 6) return '3-6';
  if (currentStreak <= 13) return '7-13';
  return '14+';
}
