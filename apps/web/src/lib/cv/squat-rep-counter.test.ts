import { POSE_LM, type Landmark } from './pose-visibility';
import {
  BOTTOM_HOLD_FRAMES,
  CALIBRATION_FRAMES,
  formScoreFor,
  hipReading,
  HIP_DROP,
  INITIAL_SQUAT_COUNTER_STATE,
  kneeAngleDeg,
  ratingFor,
  SMOOTHING_WINDOW,
  updateSquatCounter,
  type SquatCounterState,
} from './squat-rep-counter';

const VISIBLE = 0.9;

/** Feeds enough stable standing frames to lock the calibration baseline, so a
 * test can then exercise the state machine. Returns the calibrated state. */
function calibrate(state: SquatCounterState, startMs = 0, stepMs = 50): SquatCounterState {
  let s = state;
  let t = startMs;
  // One extra frame beyond the window so the baseline is definitely locked.
  for (let i = 0; i < CALIBRATION_FRAMES + 1; i += 1) {
    s = updateSquatCounter(s, pose(0), t);
    t += stepMs;
  }
  return s;
}

/**
 * Builds a full-body pose. `hipDropFrac` shifts the hips (and knees/ankles)
 * DOWN by that fraction of the torso length — so it directly drives the hip-drop
 * depth signal. Standing = 0. Shoulders stay fixed (the torso reference).
 * Coordinates are normalized, y increasing downward.
 */
function pose(hipDropFrac: number): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
  const shoulderY = 0.2;
  const standingHipY = 0.5;
  const torso = standingHipY - shoulderY; // 0.3
  const hipY = standingHipY + hipDropFrac * torso;

  const set = (i: number, x: number, y: number) => {
    lm[i] = { x, y, visibility: VISIBLE };
  };
  set(POSE_LM.leftShoulder, 0.4, shoulderY);
  set(POSE_LM.rightShoulder, 0.6, shoulderY);
  set(POSE_LM.leftHip, 0.43, hipY);
  set(POSE_LM.rightHip, 0.57, hipY);
  // Knees/ankles below the hips; their exact y doesn't affect hip-drop but must
  // be visible for the confidence filter to pass.
  set(POSE_LM.leftKnee, 0.43, hipY + 0.15);
  set(POSE_LM.rightKnee, 0.57, hipY + 0.15);
  set(POSE_LM.leftAnkle, 0.43, hipY + 0.3);
  set(POSE_LM.rightAnkle, 0.57, hipY + 0.3);
  set(POSE_LM.nose, 0.5, 0.1);
  return lm;
}

/** Feeds a stand → deep-hold → stand cycle through the counter. `holdFrames`
 * bottom frames at `dropFrac`, spaced `stepMs` apart. */
function doRep(
  state: SquatCounterState,
  startMs: number,
  // Comfortably past HIP_DROP.depth rather than exactly on it, so the moving
  // average has settled above the gate by the time the hold is counted.
  dropFrac = HIP_DROP.depth + 0.15,
  holdFrames = BOTTOM_HOLD_FRAMES + 1,
  stepMs = 200,
  formOk = true,
): SquatCounterState {
  let s = state;
  let t = startMs;
  // Calibrate the standing baseline first (stable standing frames).
  s = calibrate(s, t, stepMs);
  t += (CALIBRATION_FRAMES + 1) * stepMs;
  for (let i = 0; i < holdFrames; i += 1) {
    s = updateSquatCounter(s, pose(dropFrac), t, formOk);
    t += stepMs;
  }
  // Standing frames so the moving average flushes back below `up` and the
  // ascending→standing transition (which completes the rep) is reached. Stop as
  // soon as the descent closes so the caller sees the one-shot `lastOutcome`.
  for (let i = 0; i < 5; i += 1) {
    s = updateSquatCounter(s, pose(0), t, formOk);
    t += stepMs;
    if (s.lastOutcome != null) break;
  }
  return s;
}

describe('hipReading', () => {
  it('returns hip Y and torso length for a full-body pose', () => {
    const r = hipReading(pose(0));
    expect(r).not.toBeNull();
    expect(r!.hipY).toBeCloseTo(0.5, 5);
    expect(r!.torso).toBeCloseTo(0.3, 5);
  });

  it('returns null when a required landmark is not visible (confidence filter)', () => {
    const p = pose(0);
    p[POSE_LM.leftHip] = { x: 0.43, y: 0.5, visibility: 0.1 };
    expect(hipReading(p)).toBeNull();
  });
});

describe('updateSquatCounter (hip-drop)', () => {
  it('counts a clean deep rep and reports a "counted" outcome', () => {
    const s = doRep(INITIAL_SQUAT_COUNTER_STATE, 0);
    expect(s.repCount).toBe(1);
    expect(s.phase).toBe('up');
    expect(s.repDepths.length).toBe(1);
    expect(s.repDepths[0]).toBeGreaterThanOrEqual(HIP_DROP.depth);
    expect(s.lastOutcome).toEqual({ kind: 'counted' });
  });

  it('does NOT count a deep rep done with bad form (formOk=false), reason "stance"', () => {
    // Deep + long enough, but form was bad throughout → rejected.
    const s = doRep(INITIAL_SQUAT_COUNTER_STATE, 0, 0.5, BOTTOM_HOLD_FRAMES + 1, 200, false);
    expect(s.repCount).toBe(0);
    expect(s.lastOutcome).toEqual({ kind: 'rejected', reason: 'stance' });
  });

  it('rejects a rep if bad form appears on even ONE frame mid-descent', () => {
    // Good calibration, a descent that IS deep and long enough to count, and
    // good form on every frame but one — so 'stance' is the only thing left to
    // reject it for. Held past BOTTOM_HOLD_FRAMES on purpose: if the hold were
    // too short the rejection reason would be 'shallow' and this test would no
    // longer be exercising the form gate at all.
    const deep = HIP_DROP.depth + 0.1;
    let s = calibrate(INITIAL_SQUAT_COUNTER_STATE, 0, 200);
    let t = (CALIBRATION_FRAMES + 1) * 200;
    s = updateSquatCounter(s, pose(deep), t, true); // enters down, good form
    s = updateSquatCounter(s, pose(deep), (t += 200), false); // one bad-form frame
    for (let i = 0; i < BOTTOM_HOLD_FRAMES; i++) {
      s = updateSquatCounter(s, pose(deep), (t += 200), true); // held at depth
    }
    for (let i = 0; i < SMOOTHING_WINDOW; i++) {
      s = updateSquatCounter(s, pose(0), (t += 200), true); // back to standing
    }
    expect(s.repCount).toBe(0);
    expect(s.lastOutcome).toEqual({ kind: 'rejected', reason: 'stance' });
  });

  it('does NOT count a small partial dip that a user might try to pass off as a rep', () => {
    // The behaviour change: a shallow bob (hips drop ~30% of torso — visible
    // movement, knees barely bending) must be rejected, not counted. This is
    // deliberately ABOVE the old 0.32 depth gate, so it would have counted
    // before and must not now.
    const s = doRep(INITIAL_SQUAT_COUNTER_STATE, 0, 0.33);
    expect(s.repCount).toBe(0);
    expect(s.lastOutcome).toEqual({ kind: 'rejected', reason: 'shallow' });
  });

  it('does NOT count a fast bounce that touches depth but never settles there', () => {
    // The other half of the partial-rep problem: dropping deep enough for a
    // frame or two and springing straight back up. Must fail the bottom hold.
    const deep = HIP_DROP.depth + 0.2;
    let s = calibrate(INITIAL_SQUAT_COUNTER_STATE, 0, 200);
    let t = (CALIBRATION_FRAMES + 1) * 200;
    s = updateSquatCounter(s, pose(deep), (t += 60));
    s = updateSquatCounter(s, pose(deep), (t += 60)); // only 2 at-depth frames
    for (let i = 0; i < SMOOTHING_WINDOW + 1; i++) {
      s = updateSquatCounter(s, pose(0), (t += 60));
    }
    expect(s.repCount).toBe(0);
  });

  it('still counts a genuinely deep, controlled rep', () => {
    // Guards against the stricter gates making real squats uncountable.
    const s = doRep(INITIAL_SQUAT_COUNTER_STATE, 0, HIP_DROP.depth + 0.2, BOTTOM_HOLD_FRAMES + 2, 200);
    expect(s.repCount).toBe(1);
    expect(s.lastOutcome).toEqual({ kind: 'counted' });
  });

  it('reports a "shallow" rejection reason for a too-shallow rep', () => {
    const s = doRep(INITIAL_SQUAT_COUNTER_STATE, 0, (HIP_DROP.down + HIP_DROP.depth) / 2 - 0.02);
    expect(s.repCount).toBe(0);
    expect(s.lastOutcome).toEqual({ kind: 'rejected', reason: 'shallow' });
  });

  it('counts multiple sequential reps', () => {
    let s = INITIAL_SQUAT_COUNTER_STATE;
    s = doRep(s, 0);
    s = doRep(s, 3000);
    s = doRep(s, 6000);
    expect(s.repCount).toBe(3);
  });

  it('does not count a shallow dip that never reaches depth', () => {
    // Drop only to just past the "down" threshold, never near `depth`.
    const s = doRep(INITIAL_SQUAT_COUNTER_STATE, 0, (HIP_DROP.down + HIP_DROP.depth) / 2 - 0.02);
    expect(s.repCount).toBe(0);
  });

  it('does not count a fast bounce below the minimum rep duration', () => {
    // Deep and held enough frames, but descent→return spans < MIN_REP_MS.
    let s = calibrate(INITIAL_SQUAT_COUNTER_STATE, 0, 50);
    let t = 1000; // well after calibration
    s = updateSquatCounter(s, pose(0.5), t); // enters down
    s = updateSquatCounter(s, pose(0.5), (t += 30));
    s = updateSquatCounter(s, pose(0.5), (t += 30));
    s = updateSquatCounter(s, pose(0.5), (t += 30)); // deep, held
    // Return to standing quickly — total descent span < 500ms.
    s = updateSquatCounter(s, pose(0), (t += 30));
    s = updateSquatCounter(s, pose(0), (t += 30));
    s = updateSquatCounter(s, pose(0), (t += 30));
    expect(s.repCount).toBe(0);
  });

  it('requires the bottom to be held for BOTTOM_HOLD_FRAMES', () => {
    // Exactly ONE frame with raw drop at depth, then back up — widely spaced so
    // duration is not the reason it fails, only the bottom-hold count is.
    let s = calibrate(INITIAL_SQUAT_COUNTER_STATE, 0, 50);
    s = updateSquatCounter(s, pose(0.2), 1000); // raw 0.2 < depth → down, 0 held
    s = updateSquatCounter(s, pose(0.6), 1300); // raw 0.6 ≥ depth → 1 held frame
    s = updateSquatCounter(s, pose(0.2), 1600); // raw 0.2 < depth → stops holding
    s = updateSquatCounter(s, pose(0), 1900);
    s = updateSquatCounter(s, pose(0), 2200);
    s = updateSquatCounter(s, pose(0), 2500);
    // Only 1 raw-at-depth frame < BOTTOM_HOLD_FRAMES → not counted.
    expect(BOTTOM_HOLD_FRAMES).toBeGreaterThan(1);
    expect(s.repCount).toBe(0);
  });

  it('holds state on a low-confidence frame instead of resetting', () => {
    let s = calibrate(INITIAL_SQUAT_COUNTER_STATE, 0, 50);
    s = updateSquatCounter(s, pose(0.5), 1000);
    const blindPose = pose(0.5).map((p, i) => (i === POSE_LM.leftAnkle ? { ...p, visibility: 0.1 } : p));
    const held = updateSquatCounter(s, blindPose, 1200);
    expect(held).toEqual(s);
  });

  it('does not count going down without returning up', () => {
    let s = calibrate(INITIAL_SQUAT_COUNTER_STATE, 0, 50);
    s = updateSquatCounter(s, pose(0.5), 1000);
    s = updateSquatCounter(s, pose(0.5), 1300);
    expect(s.repCount).toBe(0);
    expect(s.phase).toBe('down');
  });

  it('does not calibrate a baseline while the hips are still moving', () => {
    // Feed CALIBRATION_FRAMES of DIFFERENT hip positions (unstable) — no lock.
    let s = INITIAL_SQUAT_COUNTER_STATE;
    let t = 0;
    for (let i = 0; i < CALIBRATION_FRAMES + 2; i += 1) {
      s = updateSquatCounter(s, pose(i * 0.1), t); // moving down each frame
      t += 50;
    }
    expect(s.baselineHipY).toBeNull();
    expect(s.repCount).toBe(0);
  });

  it('locks the baseline only after the hips are stable, then holds it', () => {
    const s = calibrate(INITIAL_SQUAT_COUNTER_STATE, 0, 50);
    expect(s.baselineHipY).not.toBeNull();
    const baseline = s.baselineHipY;
    const next = updateSquatCounter(s, pose(0.5), 1000);
    // Baseline stays put even though hips dropped — otherwise depth would read 0.
    expect(next.baselineHipY).toBe(baseline);
  });

  it('does not count phantom reps from standing sway (calibrated, no real squat)', () => {
    // Regression for the reported bug: after calibration, small standing motion
    // (well under the down threshold) must never count.
    let s = calibrate(INITIAL_SQUAT_COUNTER_STATE, 0, 50);
    let t = 1000;
    for (let i = 0; i < 20; i += 1) {
      const sway = (i % 2 === 0 ? 0.05 : -0.02); // tiny, below down=0.12
      s = updateSquatCounter(s, pose(Math.max(0, sway)), t);
      t += 100;
    }
    expect(s.repCount).toBe(0);
  });
});

describe('kneeAngleDeg (retained for depth readout)', () => {
  it('returns null when no leg is visible', () => {
    const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
    expect(kneeAngleDeg(lm)).toBeNull();
  });
});

describe('formScoreFor', () => {
  it('scores 0 with no completed reps', () => {
    expect(formScoreFor(INITIAL_SQUAT_COUNTER_STATE)).toBe(0);
  });

  it('scores a single rep neutrally at 100', () => {
    const s = doRep(INITIAL_SQUAT_COUNTER_STATE, 0);
    expect(formScoreFor(s)).toBe(100);
  });

  it('scores consistent reps higher than inconsistent ones', () => {
    // Every rep here must be deep enough to actually COUNT (>= HIP_DROP.depth),
    // otherwise the comparison is between rep counts rather than form scores.
    let consistent = INITIAL_SQUAT_COUNTER_STATE;
    consistent = doRep(consistent, 0, 0.7);
    consistent = doRep(consistent, 3000, 0.7);
    consistent = doRep(consistent, 6000, 0.7);

    let inconsistent = INITIAL_SQUAT_COUNTER_STATE;
    inconsistent = doRep(inconsistent, 0, 0.55);
    inconsistent = doRep(inconsistent, 3000, 1.15);
    inconsistent = doRep(inconsistent, 6000, 0.7);

    expect(consistent.repCount).toBe(3);
    expect(inconsistent.repCount).toBe(3);
    expect(formScoreFor(inconsistent)).toBeLessThan(formScoreFor(consistent));
  });
});

// Bands are tuned for the 30-second session length (see ratingFor).
describe('ratingFor', () => {
  it('rates high rep count with good form as Excellent', () => {
    expect(ratingFor(12, 80)).toBe('Excellent');
  });
  it('rates a moderate session as Good', () => {
    expect(ratingFor(7, 60)).toBe('Good');
  });
  it('rates a low rep count as Fair when above the floor', () => {
    expect(ratingFor(3, 30)).toBe('Fair');
  });
  it('rates a very short session as Needs improvement', () => {
    expect(ratingFor(2, 90)).toBe('Needs improvement');
  });
  it('withholds Excellent when the rep count is there but form is poor', () => {
    expect(ratingFor(12, 40)).toBe('Fair');
  });
  it('reaches Excellent within what a 30s set allows', () => {
    // ~10 controlled reps is a realistic strong 30s set — the band must be
    // achievable, which it was not under the old 60s-calibrated threshold.
    expect(ratingFor(10, 75)).toBe('Excellent');
  });
});
