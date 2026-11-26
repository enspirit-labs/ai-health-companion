import { chooseIdleNudge, IDLE_GRACE_MS, NUDGE_LEVELS } from './idle-nudge';

const BASE = { idleForMs: 0, isDescending: false, repCount: 0, secondsLeft: 30 };

describe('chooseIdleNudge', () => {
  it('says nothing during the grace period', () => {
    // Normal squat tempo pauses briefly at the top; reacting to that would fire
    // a nudge between every rep.
    expect(chooseIdleNudge({ ...BASE, idleForMs: IDLE_GRACE_MS - 1 })).toBeNull();
  });

  it('nudges once the grace period has passed', () => {
    const nudge = chooseIdleNudge({ ...BASE, idleForMs: IDLE_GRACE_MS });
    expect(nudge).not.toBeNull();
    expect(nudge?.key).toBe('idle-1');
  });

  it('never nudges while the user is mid-descent, however long since the last rep', () => {
    // They ARE working — a slow controlled squat must not be interrupted.
    const nudge = chooseIdleNudge({ ...BASE, idleForMs: 60_000, isDescending: true });
    expect(nudge).toBeNull();
  });

  it('escalates through the levels as idle time grows', () => {
    const keys = NUDGE_LEVELS.map((level) => chooseIdleNudge({ ...BASE, idleForMs: level.atMs })?.key);
    expect(keys).toEqual(['idle-1', 'idle-2', 'idle-3']);
  });

  it('stays on the final level rather than falling silent when idle very long', () => {
    const nudge = chooseIdleNudge({ ...BASE, idleForMs: 120_000 });
    expect(nudge?.key).toBe('idle-3');
  });

  it('gives a distinct key per level so each is spoken at most once', () => {
    const keys = new Set(NUDGE_LEVELS.map((l) => l.key));
    expect(keys.size).toBe(NUDGE_LEVELS.length);
  });

  it('words the first nudge as "start" before any rep and "keep going" after', () => {
    const first = chooseIdleNudge({ ...BASE, idleForMs: IDLE_GRACE_MS, repCount: 0 });
    expect(first?.text).toMatch(/start/i);

    const later = chooseIdleNudge({ ...BASE, idleForMs: IDLE_GRACE_MS, repCount: 4 });
    expect(later?.text).toMatch(/keep going/i);
  });

  it('coaches the actual movement at the second level', () => {
    const nudge = chooseIdleNudge({ ...BASE, idleForMs: NUDGE_LEVELS[1].atMs });
    expect(nudge?.text).toMatch(/knees/i);
  });

  it('leans on the remaining time at the final level', () => {
    const nudge = chooseIdleNudge({ ...BASE, idleForMs: NUDGE_LEVELS[2].atMs, secondsLeft: 9 });
    expect(nudge?.text).toContain('9 seconds');
  });

  it('rounds a fractional seconds-left up so it never reads as 0 while live', () => {
    const nudge = chooseIdleNudge({ ...BASE, idleForMs: NUDGE_LEVELS[2].atMs, secondsLeft: 3.2 });
    expect(nudge?.text).toContain('4 seconds');
  });

  it('never reports negative time if the clock overshoots', () => {
    const nudge = chooseIdleNudge({ ...BASE, idleForMs: NUDGE_LEVELS[2].atMs, secondsLeft: -2 });
    expect(nudge?.text).toContain('0 seconds');
  });

  it('always returns text suitable for both the screen and the voice', () => {
    for (const level of NUDGE_LEVELS) {
      const nudge = chooseIdleNudge({ ...BASE, idleForMs: level.atMs });
      expect(nudge?.text.length ?? 0).toBeGreaterThan(0);
    }
  });
});
