import { POSE_LM, type Landmark } from './pose-visibility';

/**
 * Squat rep counter driven by HIP DROP rather than knee angle.
 *
 * Why hip drop: from a front-facing camera the 2D hip-knee-ankle angle barely
 * changes during a squat (the knee bend is largely along the camera's depth
 * axis, which a flat projection foreshortens), so a knee-angle threshold is
 * unreliable and frequently fails to count real squats. The vertical descent
 * of the hips, however, is clearly visible from any angle. We measure it as a
 * fraction of the user's torso length so it's independent of camera distance,
 * relative to a standing baseline captured automatically at the top.
 *
 * State machine:  standing → descending → bottom-hold → ascending → (count)
 *
 * Robustness, per the agreed design:
 *  - Smoothing:     N-frame moving average on the hip-drop signal.
 *  - Hysteresis:    separate down/up thresholds so jitter can't double-count.
 *  - Confidence:    frames with low-visibility hip/knee/ankle are ignored.
 *  - Min duration:  a rep must take at least MIN_REP_MS (rejects fast bounces).
 *  - Bottom hold:   depth must persist BOTTOM_HOLD_FRAMES before it's a bottom.
 */

const MIN_VISIBILITY = 0.5;

export const HIP_DROP = {
  /** Hip drop (fraction of torso length) to enter the descending phase. */
  down: 0.12,
  /**
   * Hip drop to be considered "at depth" (bottom) — the gate that decides
   * whether a descent is a real squat or just a small dip.
   *
   * Set at 0.50 torso-lengths, which corresponds to roughly a thighs-parallel
   * squat. A shallow bob (a few inches, knees barely bending) lands nearer
   * 0.15-0.30 and is now correctly rejected as 'shallow' rather than counted.
   * Raising this is the single most effective lever against over-counting:
   * partial reps were previously clearing the old 0.32 bar.
   */
  depth: 0.5,
  /** Hip must rise back under this to complete the rep — well below `depth`
   * so a wobble at the bottom can't bounce across the boundary repeatedly. */
  up: 0.12,
} as const;

/** Frames of smoothing on the hip-drop signal (moving average). */
export const SMOOTHING_WINDOW = 3;
/**
 * Contiguous at-depth frames required before we accept "bottom reached".
 * At the ~16fps inference cadence each frame is ~60ms, so 4 frames means the
 * user must genuinely settle at the bottom for ~1/4 second. This rejects the
 * other half of the partial-rep problem: dropping fast enough to touch depth
 * for a single frame and immediately springing back up.
 */
export const BOTTOM_HOLD_FRAMES = 4;
/** A rep must span at least this long (ms) — rejects quick bounces. A properly
 * controlled squat (down, brief hold, back up) does not complete in under a
 * second, so sub-second descents are bobs rather than reps. */
export const MIN_REP_MS = 900;

/** Baseline calibration: the standing hip position is only locked once the
 * hips have been STABLE (barely moving) for this many consecutive frames. This
 * prevents locking a bad baseline on the first frame while the user is still
 * moving/crouching — a bad baseline was the main cause of phantom reps. */
export const CALIBRATION_FRAMES = 5;
/** Max hip movement between frames (fraction of torso) that still counts as
 * "stable" for calibration. */
export const CALIBRATION_STABLE_DELTA = 0.04;

export type SquatPhase = 'up' | 'down';

/** Why the most recently completed descent did or didn't count. `null` between
 * reps; set for exactly the frame a descent closes so the UI can react once. */
export type RepOutcome =
  | { kind: 'counted' }
  | { kind: 'rejected'; reason: 'shallow' | 'fast' | 'stance' }
  | null;

export interface SquatCounterState {
  phase: SquatPhase;
  repCount: number;
  /** Standing hip Y captured as the depth baseline; null until calibrated. */
  baselineHipY: number | null;
  /** Torso length captured with the baseline, to normalize hip drop. */
  baselineTorso: number | null;
  /** Recent raw hipY samples used to detect a stable standing pose before the
   * baseline is locked. Cleared once calibrated. */
  calibrationHipYs: number[];
  /** Recent smoothed-input samples of raw hip drop (fraction of torso) for the
   * moving average. */
  dropSamples: number[];
  /** Deepest smoothed hip-drop reached during the in-progress descent. */
  currentRepMaxDrop: number;
  /** Contiguous frames spent at/beyond `depth` this descent (bottom hold). */
  bottomFrames: number;
  /** Timestamp the current descent began, for the min-duration gate. */
  descentStartedAtMs: number | null;
  /** True if bad form (e.g. wrong leg stance) was observed at any point during
   * the in-progress descent — disqualifies the rep from counting. */
  badFormThisRep: boolean;
  /** One entry per completed rep — max hip drop reached (depth quality). */
  repDepths: number[];
  /** One entry per completed rep — bottom→top duration in ms (tempo). */
  repDurationsMs: number[];
  lastPhaseChangeAtMs: number | null;
  /** Set on the frame a descent closes: whether it counted or why it didn't.
   * `null` otherwise, so the caller reacts exactly once per completed rep. */
  lastOutcome: RepOutcome;
  /** This frame's smoothed hip drop (fraction of torso), 0 until calibrated —
   * purely a UI readout (live depth-progress indicator), never consulted by
   * the state machine itself, which uses its own local `drop`/`rawDrop`. */
  liveDrop: number;
}

export const INITIAL_SQUAT_COUNTER_STATE: SquatCounterState = {
  phase: 'up',
  repCount: 0,
  baselineHipY: null,
  baselineTorso: null,
  calibrationHipYs: [],
  dropSamples: [],
  currentRepMaxDrop: 0,
  bottomFrames: 0,
  descentStartedAtMs: null,
  badFormThisRep: false,
  repDepths: [],
  repDurationsMs: [],
  lastPhaseChangeAtMs: null,
  lastOutcome: null,
  liveDrop: 0,
};

function isVisible(landmark: Landmark | undefined): landmark is Landmark {
  return landmark != null && (landmark.visibility ?? 0) >= MIN_VISIBILITY;
}

/** Angle at vertex `b`, in degrees, formed by rays b->a and b->c. Retained for
 * depth/analysis callers; the rep counter no longer relies on it. */
function angleAtVertex(a: Landmark, b: Landmark, c: Landmark): number {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;
  const magAB = Math.hypot(abx, aby);
  const magCB = Math.hypot(cbx, cby);
  if (magAB === 0 || magCB === 0) return 180;
  const cos = Math.min(1, Math.max(-1, (abx * cbx + aby * cby) / (magAB * magCB)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Hip-knee-ankle angle, averaged across both visible legs. Returns null when
 * neither leg has all three landmarks visible. Kept exported for callers that
 * want a depth-angle readout; not used by the rep state machine. */
export function kneeAngleDeg(landmarks: Landmark[] | undefined): number | null {
  const at = (index: number) => landmarks?.[index];
  const lHip = at(POSE_LM.leftHip);
  const lKnee = at(POSE_LM.leftKnee);
  const lAnkle = at(POSE_LM.leftAnkle);
  const left = isVisible(lHip) && isVisible(lKnee) && isVisible(lAnkle) ? angleAtVertex(lHip, lKnee, lAnkle) : null;
  const rHip = at(POSE_LM.rightHip);
  const rKnee = at(POSE_LM.rightKnee);
  const rAnkle = at(POSE_LM.rightAnkle);
  const right = isVisible(rHip) && isVisible(rKnee) && isVisible(rAnkle) ? angleAtVertex(rHip, rKnee, rAnkle) : null;
  if (left != null && right != null) return (left + right) / 2;
  return left ?? right;
}

interface HipReading {
  hipY: number;
  torso: number;
}

/**
 * Confidence-filtered hip midpoint Y + torso length from landmarks. Requires
 * both hips and both shoulders visible (torso reference) and both knees +
 * ankles too, so a partly-out-of-frame body doesn't yield a misleading reading.
 * Returns null when the pose isn't trustworthy this frame.
 */
export function hipReading(landmarks: Landmark[] | undefined): HipReading | null {
  const at = (index: number) => landmarks?.[index];
  const lShoulder = at(POSE_LM.leftShoulder);
  const rShoulder = at(POSE_LM.rightShoulder);
  const lHip = at(POSE_LM.leftHip);
  const rHip = at(POSE_LM.rightHip);
  const lKnee = at(POSE_LM.leftKnee);
  const rKnee = at(POSE_LM.rightKnee);
  const lAnkle = at(POSE_LM.leftAnkle);
  const rAnkle = at(POSE_LM.rightAnkle);

  if (
    !isVisible(lShoulder) ||
    !isVisible(rShoulder) ||
    !isVisible(lHip) ||
    !isVisible(rHip) ||
    !isVisible(lKnee) ||
    !isVisible(rKnee) ||
    !isVisible(lAnkle) ||
    !isVisible(rAnkle)
  ) {
    return null;
  }

  const hipY = (lHip.y + rHip.y) / 2;
  const shoulderY = (lShoulder.y + rShoulder.y) / 2;
  const torso = Math.abs(hipY - shoulderY);
  if (torso <= 0) return null;
  return { hipY, torso };
}

function movingAverage(samples: number[]): number {
  if (samples.length === 0) return 0;
  return samples.reduce((sum, v) => sum + v, 0) / samples.length;
}

/**
 * Advances the rep-counting state machine by one frame from raw landmarks.
 *
 * A rep completes on the ascending→standing transition, and counts only if the
 * descent reached `depth` (held for BOTTOM_HOLD_FRAMES), spanned at least
 * MIN_REP_MS, AND had good form throughout. `formOk` is the caller's per-frame
 * form verdict (e.g. leg stance within range) — any bad-form frame during the
 * descent disqualifies that rep. Defaults to true so form gating is opt-in.
 * Low-confidence frames (no reliable hip reading) hold state without resetting.
 */
export function updateSquatCounter(
  state: SquatCounterState,
  landmarks: Landmark[] | undefined,
  timestampMs: number,
  formOk: boolean = true,
): SquatCounterState {
  const reading = hipReading(landmarks);
  // Confidence filter: an untrustworthy frame holds state (no reset).
  if (reading == null) return state;

  // --- Baseline calibration ------------------------------------------------
  // Lock the standing baseline ONLY after the hips have been stable (barely
  // moving) for CALIBRATION_FRAMES. Capturing it on the first frame — while the
  // user may still be moving into position or crouched — produced a wrong
  // reference, against which ordinary standing motion crossed the thresholds
  // and counted phantom reps. Until calibrated, we accumulate samples and do
  // NOT run the state machine (so nothing can be counted from a bad baseline).
  if (state.baselineHipY == null || state.baselineTorso == null) {
    const calibrationHipYs = [...state.calibrationHipYs, reading.hipY].slice(-CALIBRATION_FRAMES);
    if (calibrationHipYs.length < CALIBRATION_FRAMES) {
      return { ...state, calibrationHipYs };
    }
    // Stable when the spread across the window is small relative to torso.
    const min = Math.min(...calibrationHipYs);
    const max = Math.max(...calibrationHipYs);
    const stable = (max - min) / reading.torso <= CALIBRATION_STABLE_DELTA;
    if (!stable) {
      // Still moving — keep sampling, don't lock yet.
      return { ...state, calibrationHipYs };
    }
    // Lock the baseline from the (stable) standing pose.
    return {
      ...state,
      baselineHipY: reading.hipY,
      baselineTorso: reading.torso,
      calibrationHipYs: [],
      dropSamples: [],
      phase: 'up',
      currentRepMaxDrop: 0,
      bottomFrames: 0,
      descentStartedAtMs: null,
    };
  }

  const baselineHipY = state.baselineHipY;
  const baselineTorso = state.baselineTorso;

  // Raw hip drop this frame (fraction of torso), then smoothed via moving avg.
  const rawDrop = (reading.hipY - baselineHipY) / baselineTorso;
  const dropSamples = [...state.dropSamples, rawDrop].slice(-SMOOTHING_WINDOW);
  const drop = movingAverage(dropSamples);

  // `lastOutcome` is a one-shot: clear it every frame unless a rep closes below.
  const base: SquatCounterState = {
    ...state,
    baselineHipY,
    baselineTorso,
    dropSamples,
    lastOutcome: null,
    liveDrop: Math.max(0, drop),
  };

  // Bottom-hold counts frames genuinely at depth. Gate on the RAW drop, not the
  // smoothed one, so the moving-average lag (which keeps the smoothed value high
  // for a frame or two after the user has already stood up) can't inflate the
  // hold count with standing frames.
  const atDepthNow = rawDrop >= HIP_DROP.depth;

  if (state.phase === 'up') {
    // Begin a descent once smoothed drop crosses the down threshold.
    if (drop > HIP_DROP.down) {
      return {
        ...base,
        phase: 'down',
        currentRepMaxDrop: drop,
        bottomFrames: atDepthNow ? 1 : 0,
        descentStartedAtMs: timestampMs,
        // Start form tracking for this descent — bad now or any later frame.
        badFormThisRep: !formOk,
        lastPhaseChangeAtMs: timestampMs,
      };
    }
    return base;
  }

  // phase === 'down'
  const currentRepMaxDrop = Math.max(state.currentRepMaxDrop, drop);
  const bottomFrames = atDepthNow ? state.bottomFrames + 1 : state.bottomFrames;
  // Sticky: once bad form is seen during the descent, the rep is disqualified.
  const badFormThisRep = state.badFormThisRep || !formOk;

  // Complete the rep on return toward standing.
  if (drop < HIP_DROP.up) {
    const reachedDepth = currentRepMaxDrop >= HIP_DROP.depth && bottomFrames >= BOTTOM_HOLD_FRAMES;
    const durationMs = state.descentStartedAtMs == null ? 0 : timestampMs - state.descentStartedAtMs;
    const longEnough = durationMs >= MIN_REP_MS;

    const cleared: SquatCounterState = {
      ...base,
      phase: 'up',
      currentRepMaxDrop: 0,
      bottomFrames: 0,
      descentStartedAtMs: null,
      badFormThisRep: false,
      lastPhaseChangeAtMs: timestampMs,
    };

    if (reachedDepth && longEnough && !badFormThisRep) {
      return {
        ...cleared,
        repCount: state.repCount + 1,
        repDepths: [...state.repDepths, currentRepMaxDrop],
        repDurationsMs: [...state.repDurationsMs, durationMs],
        lastOutcome: { kind: 'counted' },
      };
    }
    // Came back up without a valid rep — reject with the most relevant reason,
    // in priority order: too shallow, then bad form, then too fast.
    const reason: 'shallow' | 'fast' | 'stance' = !reachedDepth
      ? 'shallow'
      : badFormThisRep
        ? 'stance'
        : 'fast';
    return { ...cleared, lastOutcome: { kind: 'rejected', reason } };
  }

  return { ...base, currentRepMaxDrop, bottomFrames, badFormThisRep };
}

/** 100 when every value is identical, decaying to 0 as relative spread
 * (coefficient of variation) grows — 50% spread or more scores 0. A single rep
 * can't demonstrate consistency, so it scores neutrally rather than penalized. */
function consistencyScore(values: number[]): number {
  if (values.length < 2) return 100;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  if (mean === 0) return 100;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  const coefficientOfVariation = Math.sqrt(variance) / mean;
  return Math.round(Math.max(0, Math.min(100, 100 * (1 - coefficientOfVariation / 0.5))));
}

/** Blends depth consistency (are reps hitting a similar depth?) with tempo
 * consistency (is the pace steady?) into a single 0-100 form score. */
export function formScoreFor(state: SquatCounterState): number {
  if (state.repDepths.length === 0) return 0;
  return Math.round((consistencyScore(state.repDepths) + consistencyScore(state.repDurationsMs)) / 2);
}

/** Rep bands are calibrated to the 30-second session length used by the squats
 * assessment. A controlled full-depth squat takes ~2.5-3s, so ~10-12 reps is a
 * strong 30s set — the previous 20/12/6 bands were set for a 60-second session
 * and made "Excellent" unreachable once the session was halved. */
export function ratingFor(repCount: number, formScore: number): string {
  if (repCount >= 10 && formScore >= 75) return 'Excellent';
  if (repCount >= 6 && formScore >= 55) return 'Good';
  if (repCount >= 3) return 'Fair';
  return 'Needs improvement';
}
