import { previousDateKey } from './date.util';

/**
 * Missed days tolerated before a streak breaks. One missed day (between two
 * check-ins, or since the last one) neither ends the streak nor counts toward
 * it; a second consecutive missed day breaks it. Named constant so the number
 * the team agrees on lives in one place (needs clinician review).
 */
export const STREAK_GRACE_DAYS = 1;

export interface StreakResult {
  currentStreak: number;
  completedToday: boolean;
  /** Days with at least one completion, ever. Never reset by a lapse. */
  totalActiveDays: number;
  /**
   * The user has been active before but the streak has broken (no completion
   * within the grace window). Drives the no-blame welcome-back state.
   */
  lapsed: boolean;
}

/**
 * Pure — takes the set of calendar-day keys ("YYYY-MM-DD", already bucketed
 * in the user's own timezone by the caller) that had at least one completed
 * assessment, plus today's key (also caller-computed via dateKeyInZone), and
 * walks backward counting a run that tolerates up to STREAK_GRACE_DAYS missed
 * days at a time. Only days with a completion are counted.
 *
 * Deliberately has no knowledge of timezones or Prisma — DashboardService
 * owns fetching completedAt timestamps and converting them to zone-bucketed
 * keys; this only ever does calendar-key arithmetic, which is what makes it
 * trivially unit-testable without wall-clock or DB dependencies.
 */
export function computeCurrentStreak(completedDayKeys: Set<string>, todayKey: string): StreakResult {
  const completedToday = completedDayKeys.has(todayKey);
  const totalActiveDays = completedDayKeys.size;

  // Today is still open, so it is never counted as a missed day: the streak
  // is alive while the latest completion is at most GRACE_DAYS + 1 days back.
  let cursor: string | null = findNextCompleted(completedDayKeys, todayKey, 0);
  if (cursor === null) {
    return { currentStreak: 0, completedToday, totalActiveDays, lapsed: totalActiveDays > 0 };
  }

  let currentStreak = 0;
  while (cursor !== null) {
    currentStreak += 1;
    cursor = findNextCompleted(completedDayKeys, cursor, 1);
  }
  return { currentStreak, completedToday, totalActiveDays, lapsed: false };
}

/** First completed day at `from` (offset 0) or within the grace window after
 * stepping back `startOffset` days; null once the gap exceeds the grace. */
function findNextCompleted(days: Set<string>, from: string, startOffset: number): string | null {
  let cursor = from;
  for (let i = 0; i < startOffset; i += 1) cursor = previousDateKey(cursor);
  for (let missed = 0; missed <= STREAK_GRACE_DAYS + (startOffset === 0 ? 1 : 0); missed += 1) {
    if (days.has(cursor)) return cursor;
    cursor = previousDateKey(cursor);
  }
  return null;
}
