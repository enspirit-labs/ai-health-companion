/**
 * Decides when — and how insistently — to push a user who has started the squat
 * set but isn't actually squatting.
 *
 * The problem: the set begins automatically after the count-in, so a user who
 * is framed correctly but standing still burns their whole session doing
 * nothing. Silence reads as "the app isn't working"; nagging every frame is
 * worse. So the nudge escalates with how long they've been idle, and each level
 * fires at most once per idle stretch.
 *
 * Idleness is measured from the last COMPLETED rep and from whether the counter
 * currently sees a descent in progress — a user on the way down is not idle
 * even though their rep count hasn't moved yet.
 *
 * Pure and dependency-free so the escalation ladder is unit-tested rather than
 * entangled with the rAF loop.
 */

export interface IdleNudgeInputs {
  /** Milliseconds since the set started or the last rep completed, whichever is
   * more recent. */
  idleForMs: number;
  /** True when the rep counter is mid-descent — the user IS moving, so no nudge
   * regardless of how long since the last completed rep. */
  isDescending: boolean;
  /** Reps completed so far this set. The first nudge is worded differently
   * before the user has ever squatted ("start") vs. after ("keep going"). */
  repCount: number;
  /** Seconds left in the session — the final nudge leans on the clock. */
  secondsLeft: number;
}

export interface IdleNudge {
  /** Stable key for the voice manager's debounce/cooldown bookkeeping. Also
   * identifies the escalation level, so the same level never repeats. */
  key: string;
  /** Text for both the on-screen banner and the spoken cue. */
  text: string;
}

/**
 * Escalation ladder. The user gets a gentle reminder first, then a firmer one,
 * then a time-pressure one. Thresholds are milliseconds of continuous idleness.
 *
 * Tuned against the 30-second session: at 2.5s the user has clearly paused
 * rather than simply moved slowly, and the last rung still leaves time to act.
 */
export const NUDGE_LEVELS = [
  { atMs: 2500, key: 'idle-1' },
  { atMs: 6000, key: 'idle-2' },
  { atMs: 11000, key: 'idle-3' },
] as const;

/** Below this there's nothing to say — normal squat tempo includes brief pauses
 * at the top, and reacting to those would fire between every single rep. */
export const IDLE_GRACE_MS = NUDGE_LEVELS[0].atMs;

/**
 * Returns the nudge to deliver right now, or null when the user is moving or
 * hasn't been idle long enough to warrant one.
 *
 * The caller is expected to pass the result to a debounced voice manager and to
 * render `text` on screen, so the same message is both spoken and shown.
 */
export function chooseIdleNudge(inputs: IdleNudgeInputs): IdleNudge | null {
  const { idleForMs, isDescending, repCount, secondsLeft } = inputs;

  // Actively descending — they're working, say nothing.
  if (isDescending) return null;

  // Find the highest level whose threshold has been passed.
  let level: (typeof NUDGE_LEVELS)[number] | null = null;
  for (const candidate of NUDGE_LEVELS) {
    if (idleForMs >= candidate.atMs) level = candidate;
  }
  if (!level) return null;

  const started = repCount > 0;

  if (level.key === 'idle-1') {
    return {
      key: level.key,
      text: started ? "Keep going — next squat!" : "Let's go — start squatting!",
    };
  }

  if (level.key === 'idle-2') {
    return {
      key: level.key,
      text: started
        ? "Don't stop now — bend those knees and go down!"
        : 'Bend your knees and squat down — you can do it!',
    };
  }

  // Final rung: lean on the clock. Round up so a partial second still reads as
  // time remaining rather than "0 seconds left" while the set is still live.
  const seconds = Math.max(0, Math.ceil(secondsLeft));
  return {
    key: level.key,
    text: `Only ${seconds} seconds left — squat now, push yourself!`,
  };
}
