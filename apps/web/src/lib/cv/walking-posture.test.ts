import { POSE_LM, type Landmark } from './pose-visibility';
import { analyzeWalkingPosture } from './walking-posture';
import {
  INITIAL_WALKING_SESSION_STATE,
  summarizeWalkingSession,
  updateWalkingSession,
} from './walking-posture-session';

const VISIBLE = 0.9;

interface PoseOptions {
  /** Vertical offset applied to the left shoulder (positive = dropped). */
  shoulderSkew?: number;
  /** Vertical offset applied to the left hip (positive = dropped). */
  hipSkew?: number;
  /** Horizontal shift of the whole shoulder line (trunk listing sideways). */
  shoulderShift?: number;
  /** Horizontal offset of the nose from the shoulder midpoint. */
  noseOffset?: number;
  /** Vertical distance from shoulder line to hip line. Default 0.24 → aspect
   * 1.2 with the fixed 0.2 shoulder width, comfortably clean. */
  torsoHeight?: number;
  noseVisible?: boolean;
}

/** Builds an upright, front-facing pose (shoulder width fixed at 0.2), then
 * applies the requested single deviation. */
function pose(options: PoseOptions = {}): Landmark[] {
  const {
    shoulderSkew = 0,
    hipSkew = 0,
    shoulderShift = 0,
    noseOffset = 0,
    torsoHeight = 0.24,
    noseVisible = true,
  } = options;

  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
  const shoulderY = 0.3;
  const cx = 0.5;

  lm[POSE_LM.leftShoulder] = { x: cx - 0.1 + shoulderShift, y: shoulderY + shoulderSkew, visibility: VISIBLE };
  lm[POSE_LM.rightShoulder] = { x: cx + 0.1 + shoulderShift, y: shoulderY, visibility: VISIBLE };
  lm[POSE_LM.leftHip] = { x: cx - 0.07, y: shoulderY + torsoHeight + hipSkew, visibility: VISIBLE };
  lm[POSE_LM.rightHip] = { x: cx + 0.07, y: shoulderY + torsoHeight, visibility: VISIBLE };
  lm[POSE_LM.nose] = {
    x: cx + shoulderShift + noseOffset,
    y: shoulderY - 0.1,
    visibility: noseVisible ? VISIBLE : 0,
  };
  return lm;
}

describe('analyzeWalkingPosture', () => {
  it('passes a clean upright walking frame', () => {
    const r = analyzeWalkingPosture(pose());
    expect(r.measured).toBe(true);
    expect(r.faults).toEqual([]);
    expect(r.primary).toBeNull();
    expect(r.score).toBe(100);
  });

  it('reports unmeasurable when the torso is not visible', () => {
    const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
    const r = analyzeWalkingPosture(lm);
    expect(r.measured).toBe(false);
    expect(r.faults).toEqual([]);
    expect(r.score).toBe(0);
  });

  it('reports unmeasurable for missing landmarks entirely', () => {
    expect(analyzeWalkingPosture(undefined).measured).toBe(false);
  });

  it('tolerates the small shoulder rock of a normal stride', () => {
    // 0.04 ÷ 0.2 width = ratio 0.2, just inside the 0.22 limit.
    const r = analyzeWalkingPosture(pose({ shoulderSkew: 0.04 }));
    expect(r.faults.map((f) => f.kind)).not.toContain('shoulder-tilt');
  });

  it('flags uneven shoulders past the limit', () => {
    // 0.06 ÷ 0.2 = ratio 0.3 > 0.22.
    const r = analyzeWalkingPosture(pose({ shoulderSkew: 0.06 }));
    const fault = r.faults.find((f) => f.kind === 'shoulder-tilt');
    expect(fault).toBeDefined();
    expect(fault?.hint).toMatch(/level|square/i);
    expect(r.score).toBeLessThan(100);
  });

  it('flags a dropping hip', () => {
    // Hip width is 0.14; 0.05 ÷ 0.14 = ratio 0.36 > 0.22.
    const r = analyzeWalkingPosture(pose({ hipSkew: 0.05 }));
    expect(r.faults.map((f) => f.kind)).toContain('hip-drop');
  });

  it('flags a sideways trunk lean', () => {
    // 0.05 ÷ 0.2 = ratio 0.25 > 0.18. noseOffset cancels the shift so the head
    // stays over the shoulders and only the lean fires.
    const r = analyzeWalkingPosture(pose({ shoulderShift: 0.05 }));
    expect(r.faults.map((f) => f.kind)).toContain('lateral-lean');
  });

  it('flags a head carried off-centre', () => {
    // 0.06 ÷ 0.2 = ratio 0.3 > 0.22.
    const r = analyzeWalkingPosture(pose({ noseOffset: 0.06 }));
    expect(r.faults.map((f) => f.kind)).toContain('head-forward');
  });

  it('stays quiet about the head when the nose is not visible', () => {
    const r = analyzeWalkingPosture(pose({ noseOffset: 0.2, noseVisible: false }));
    expect(r.faults.map((f) => f.kind)).not.toContain('head-forward');
  });

  it('flags a hunched-forward trunk via a foreshortened torso', () => {
    // 0.15 ÷ 0.2 width = aspect 0.75 < 0.9.
    const r = analyzeWalkingPosture(pose({ torsoHeight: 0.15 }));
    expect(r.faults.map((f) => f.kind)).toContain('trunk-flexion');
  });

  it('ranks the worst fault first and exposes it as primary', () => {
    const r = analyzeWalkingPosture(pose({ shoulderSkew: 0.06, torsoHeight: 0.1 }));
    expect(r.faults.length).toBeGreaterThan(1);
    expect(r.primary).toBe(r.faults[0]);
    expect(r.faults[0].severity).toBeGreaterThanOrEqual(r.faults[1].severity);
  });

  it('never scores below zero even with many severe faults', () => {
    const r = analyzeWalkingPosture(
      pose({ shoulderSkew: 0.2, hipSkew: 0.2, shoulderShift: 0.2, noseOffset: 0.3, torsoHeight: 0.02 }),
    );
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
});

describe('walking posture session', () => {
  it('ignores unmeasurable frames entirely', () => {
    const unmeasured = analyzeWalkingPosture(undefined);
    const state = updateWalkingSession(INITIAL_WALKING_SESSION_STATE, unmeasured);
    expect(state).toBe(INITIAL_WALKING_SESSION_STATE);
    expect(summarizeWalkingSession(state).rating).toBe('inconclusive');
  });

  it('scores a clean walk as good with no persistent faults', () => {
    let state = INITIAL_WALKING_SESSION_STATE;
    for (let i = 0; i < 20; i += 1) {
      state = updateWalkingSession(state, analyzeWalkingPosture(pose()));
    }
    const summary = summarizeWalkingSession(state);
    expect(summary.measuredFrames).toBe(20);
    expect(summary.postureScore).toBe(100);
    expect(summary.persistentFaults).toEqual([]);
    expect(summary.rating).toBe('good');
  });

  it('drops a transient fault below the persistence threshold', () => {
    let state = INITIAL_WALKING_SESSION_STATE;
    // 1 bad frame in 20 = 5% share, well under the 25% bar.
    state = updateWalkingSession(state, analyzeWalkingPosture(pose({ shoulderSkew: 0.06 })));
    for (let i = 0; i < 19; i += 1) {
      state = updateWalkingSession(state, analyzeWalkingPosture(pose()));
    }
    expect(summarizeWalkingSession(state).persistentFaults).toEqual([]);
  });

  it('keeps a fault present in most frames', () => {
    let state = INITIAL_WALKING_SESSION_STATE;
    for (let i = 0; i < 15; i += 1) {
      state = updateWalkingSession(state, analyzeWalkingPosture(pose({ shoulderSkew: 0.06 })));
    }
    for (let i = 0; i < 5; i += 1) {
      state = updateWalkingSession(state, analyzeWalkingPosture(pose()));
    }
    const summary = summarizeWalkingSession(state);
    expect(summary.persistentFaults.map((f) => f.kind)).toContain('shoulder-tilt');
    expect(summary.persistentFaults[0].share).toBeCloseTo(0.75, 5);
    expect(summary.rating).not.toBe('good');
  });
});
