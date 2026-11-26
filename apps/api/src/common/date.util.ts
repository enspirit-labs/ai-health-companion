const UTC_FALLBACK = 'UTC';

/**
 * Formats a date as a plain "YYYY-MM-DD" calendar-day key in the given IANA
 * zone. Falls back to UTC when `timeZone` is null/undefined/invalid — a user
 * with no timezone set yet (or a corrupted/garbage value slipping through)
 * must never crash a request, just bucket a little less precisely until
 * their browser reports one. `Intl.DateTimeFormat` throws `RangeError` on an
 * unrecognized zone name, which this catches.
 *
 * Uses the 'en-CA' locale, whose date format is YYYY-MM-DD — a standard
 * trick to get ISO ordering out of Intl without manual string assembly.
 */
export function dateKeyInZone(date: Date, timeZone: string | null | undefined): string {
  const zone = timeZone || UTC_FALLBACK;
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: UTC_FALLBACK }).format(date);
  }
}

/**
 * One calendar day before `dateKey`. Pure string/calendar arithmetic — a
 * "YYYY-MM-DD" key already represents a specific zone's wall-clock date with
 * the zone baked in by `dateKeyInZone`, so subtracting a day from it is a
 * calendar operation, not a real-time one. Anchoring the arithmetic in UTC
 * internally is just a implementation convenience (avoids the host's local
 * zone entirely) — it has no bearing on which zone the key itself represents,
 * and correctly rolls over month/year boundaries via `Date`'s own carry
 * behavior. DST is a real-time-vs-wall-clock concept and doesn't apply to
 * calendar-day subtraction at all.
 */
export function previousDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Convenience: do two instants fall on the same calendar day in `timeZone`? */
export function isSameDayInZone(a: Date, b: Date, timeZone: string | null | undefined): boolean {
  return dateKeyInZone(a, timeZone) === dateKeyInZone(b, timeZone);
}

/**
 * 1-indexed day of the year (Jan 1st = 1), anchored in UTC. Used to rotate
 * the "something new to try" recommendation day-to-day — this is a cosmetic
 * variety mechanic, not a user-facing timestamp, so a single global UTC
 * calendar doesn't need per-user timezone precision the way streak bucketing
 * does.
 */
export function dayOfYear(date: Date): number {
  const startOfYear = Date.UTC(date.getUTCFullYear(), 0, 1);
  const startOfDay = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((startOfDay - startOfYear) / (24 * 60 * 60 * 1000)) + 1;
}
