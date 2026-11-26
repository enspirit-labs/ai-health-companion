import { dateKeyInZone, dayOfYear, isSameDayInZone, previousDateKey } from './date.util';

describe('dateKeyInZone', () => {
  it('formats a UTC instant as its UTC calendar day', () => {
    expect(dateKeyInZone(new Date('2026-01-15T10:00:00.000Z'), 'UTC')).toBe('2026-01-15');
  });

  it('a 2am Asia/Kolkata instant buckets to the IST date, not the UTC one', () => {
    // 2026-01-16T02:00 IST === 2026-01-15T20:30 UTC — the exact "late-night
    // check-in shifts to the wrong UTC day" scenario this feature exists to
    // avoid for non-UTC users.
    const instant = new Date('2026-01-15T20:30:00.000Z');
    expect(dateKeyInZone(instant, 'Asia/Kolkata')).toBe('2026-01-16');
    expect(dateKeyInZone(instant, 'UTC')).toBe('2026-01-15');
  });

  it('falls back to UTC when timeZone is null', () => {
    expect(dateKeyInZone(new Date('2026-01-15T10:00:00.000Z'), null)).toBe('2026-01-15');
  });

  it('falls back to UTC when timeZone is undefined', () => {
    expect(dateKeyInZone(new Date('2026-01-15T10:00:00.000Z'), undefined)).toBe('2026-01-15');
  });

  it('falls back to UTC when timeZone is empty', () => {
    expect(dateKeyInZone(new Date('2026-01-15T10:00:00.000Z'), '')).toBe('2026-01-15');
  });

  it('falls back to UTC instead of throwing on an invalid zone name', () => {
    expect(() => dateKeyInZone(new Date('2026-01-15T10:00:00.000Z'), 'Not/AZone')).not.toThrow();
    expect(dateKeyInZone(new Date('2026-01-15T10:00:00.000Z'), 'Not/AZone')).toBe('2026-01-15');
  });
});

describe('previousDateKey', () => {
  it('subtracts one day within a month', () => {
    expect(previousDateKey('2026-01-16')).toBe('2026-01-15');
  });

  it('crosses a month boundary', () => {
    expect(previousDateKey('2026-02-01')).toBe('2026-01-31');
  });

  it('crosses a year boundary', () => {
    expect(previousDateKey('2026-01-01')).toBe('2025-12-31');
  });

  it('crosses a leap-day boundary', () => {
    expect(previousDateKey('2026-03-01')).toBe('2026-02-28'); // 2026 is not a leap year
    expect(previousDateKey('2024-03-01')).toBe('2024-02-29'); // 2024 is
  });
});

describe('isSameDayInZone', () => {
  it('is true for two instants on the same IST calendar day, even though they differ in UTC', () => {
    const morning = new Date('2026-01-15T20:30:00.000Z'); // 2026-01-16 02:00 IST
    const evening = new Date('2026-01-16T15:00:00.000Z'); // 2026-01-16 20:30 IST
    expect(isSameDayInZone(morning, evening, 'Asia/Kolkata')).toBe(true);
  });

  it('is false across a real day boundary in the given zone', () => {
    const day1 = new Date('2026-01-15T10:00:00.000Z');
    const day2 = new Date('2026-01-16T10:00:00.000Z');
    expect(isSameDayInZone(day1, day2, 'UTC')).toBe(false);
  });
});

describe('dayOfYear', () => {
  it('is 1 on January 1st', () => {
    expect(dayOfYear(new Date('2026-01-01T12:00:00.000Z'))).toBe(1);
  });

  it('is 32 on February 1st (31 days into a non-leap year)', () => {
    expect(dayOfYear(new Date('2026-02-01T00:00:00.000Z'))).toBe(32);
  });

  it('is 366 on December 31st of a leap year', () => {
    expect(dayOfYear(new Date('2024-12-31T00:00:00.000Z'))).toBe(366);
  });

  it('is 365 on December 31st of a non-leap year', () => {
    expect(dayOfYear(new Date('2026-12-31T00:00:00.000Z'))).toBe(365);
  });

  it('is anchored in UTC, not the host clock — a late-UTC instant does not roll to the next day', () => {
    expect(dayOfYear(new Date('2026-01-01T23:59:00.000Z'))).toBe(1);
  });
});
