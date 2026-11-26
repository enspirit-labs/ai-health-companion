import { evaluatePostureFraming } from './posture-framing';
import { POSE_LM, type Landmark } from './pose-visibility';

const V = 0.9;

/** A good, front-facing, well-distanced posture shot. Individual tests
 * override only what they care about. */
function goodPosture(overrides: Record<number, Landmark> = {}): Landmark[] {
  const landmarks: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: V }));
  landmarks[POSE_LM.nose] = { x: 0.5, y: 0.25, visibility: V };
  landmarks[POSE_LM.leftEye] = { x: 0.47, y: 0.24, visibility: V };
  landmarks[POSE_LM.rightEye] = { x: 0.53, y: 0.24, visibility: V };
  landmarks[POSE_LM.leftEar] = { x: 0.42, y: 0.25, visibility: V };
  landmarks[POSE_LM.rightEar] = { x: 0.58, y: 0.25, visibility: V };
  landmarks[POSE_LM.leftShoulder] = { x: 0.35, y: 0.4, visibility: V };
  landmarks[POSE_LM.rightShoulder] = { x: 0.65, y: 0.4, visibility: V };
  landmarks[POSE_LM.leftHip] = { x: 0.38, y: 0.75, visibility: V };
  landmarks[POSE_LM.rightHip] = { x: 0.62, y: 0.75, visibility: V };
  for (const [index, value] of Object.entries(overrides)) {
    landmarks[Number(index)] = value;
  }
  return landmarks;
}

describe('evaluatePostureFraming', () => {
  it('accepts a good, front-facing, well-distanced shot', () => {
    const result = evaluatePostureFraming(goodPosture());
    expect(result.orientation).toBe('front');
    expect(result.eyesOk).toBe(true);
    expect(result.earsOk).toBe(true);
    expect(result.noseAlignedOk).toBe(true);
    expect(result.shouldersHipsOk).toBe(true);
    expect(result.tiltOk).toBe(true);
    expect(result.distanceOk).toBe(true);
    expect(result.rejectReason).toBeNull();
  });

  it('rejects as back view when torso is visible but no face landmarks are', () => {
    const result = evaluatePostureFraming(
      goodPosture({
        [POSE_LM.nose]: { x: 0.5, y: 0.25, visibility: 0.05 },
        [POSE_LM.leftEye]: { x: 0.47, y: 0.24, visibility: 0.05 },
        [POSE_LM.rightEye]: { x: 0.53, y: 0.24, visibility: 0.05 },
      }),
    );
    expect(result.orientation).toBe('back');
    expect(result.rejectReason).toBe('back');
  });

  it('rejects as side view on asymmetric ear visibility', () => {
    const result = evaluatePostureFraming(
      goodPosture({
        [POSE_LM.leftEar]: { x: 0.42, y: 0.25, visibility: 0.3 },
        [POSE_LM.rightEar]: { x: 0.58, y: 0.25, visibility: 0.8 },
      }),
    );
    expect(result.orientation).toBe('side');
    expect(result.rejectReason).toBe('side');
  });

  it('rejects as side view when the nose sits off the shoulder midpoint', () => {
    // shoulderWidth = 0.3; offset of 0.15 -> ratio 0.5, well past the 0.15 threshold
    const result = evaluatePostureFraming(goodPosture({ [POSE_LM.nose]: { x: 0.65, y: 0.25, visibility: V } }));
    expect(result.orientation).toBe('side');
    expect(result.rejectReason).toBe('side');
  });

  it('accepts a nose offset comfortably inside the 15% threshold', () => {
    // shoulderWidth = 0.3; offset of 0.03 -> ratio 0.1, well under 0.15
    const result = evaluatePostureFraming(goodPosture({ [POSE_LM.nose]: { x: 0.53, y: 0.25, visibility: V } }));
    expect(result.orientation).toBe('front');
    expect(result.noseAlignedOk).toBe(true);
  });

  it('flags eyesOk and rejects for eyes when an eye is dim but everything else is fine', () => {
    const result = evaluatePostureFraming(goodPosture({ [POSE_LM.leftEye]: { x: 0.47, y: 0.24, visibility: 0.3 } }));
    expect(result.orientation).toBe('front');
    expect(result.eyesOk).toBe(false);
    expect(result.rejectReason).toBe('eyes');
  });

  it('flags earsOk when both ears are dim but symmetric (not a side-view asymmetry)', () => {
    const result = evaluatePostureFraming(
      goodPosture({
        [POSE_LM.leftEar]: { x: 0.42, y: 0.25, visibility: 0.5 },
        [POSE_LM.rightEar]: { x: 0.58, y: 0.25, visibility: 0.5 },
      }),
    );
    expect(result.orientation).toBe('front');
    expect(result.earsOk).toBe(false);
    expect(result.rejectReason).toBe('ears');
  });

  it('rejects for shouldersHips when a hip is not confidently visible', () => {
    const result = evaluatePostureFraming(goodPosture({ [POSE_LM.leftHip]: { x: 0.38, y: 0.75, visibility: 0.3 } }));
    expect(result.orientation).toBe('front');
    expect(result.shouldersHipsOk).toBe(false);
    expect(result.rejectReason).toBe('shouldersHips');
  });

  it('rejects for tilt when shoulders are angled past 15 degrees', () => {
    // shoulderWidth = 0.3; dy = 0.3 * tan(20deg) ~= 0.109 -> ~20 degrees
    const result = evaluatePostureFraming(
      goodPosture({
        [POSE_LM.leftShoulder]: { x: 0.35, y: 0.4, visibility: V },
        [POSE_LM.rightShoulder]: { x: 0.65, y: 0.509, visibility: V },
      }),
    );
    expect(result.orientation).toBe('front');
    expect(result.tiltOk).toBe(false);
    expect(result.rejectReason).toBe('tilt');
  });

  it('rejects for distanceTooFar when the torso spans less than 15% of frame height', () => {
    const result = evaluatePostureFraming(
      goodPosture({
        [POSE_LM.leftShoulder]: { x: 0.35, y: 0.45, visibility: V },
        [POSE_LM.rightShoulder]: { x: 0.65, y: 0.45, visibility: V },
        [POSE_LM.leftHip]: { x: 0.38, y: 0.55, visibility: V },
        [POSE_LM.rightHip]: { x: 0.62, y: 0.55, visibility: V },
      }),
    );
    expect(result.distanceOk).toBe(false);
    expect(result.rejectReason).toBe('distanceTooFar');
  });

  it('accepts a realistic full-body stance where the torso spans ~24% of frame height', () => {
    // A head-to-feet framing (needed for the 'arms'/'legs' regions to also
    // confirm) puts the shoulder-to-hip span at roughly a quarter of the
    // frame, well under the old (unreachable-alongside-full-body) 30% floor
    // but comfortably inside the current 15% one.
    const result = evaluatePostureFraming(
      goodPosture({
        [POSE_LM.leftShoulder]: { x: 0.35, y: 0.3, visibility: V },
        [POSE_LM.rightShoulder]: { x: 0.65, y: 0.3, visibility: V },
        [POSE_LM.leftHip]: { x: 0.38, y: 0.54, visibility: V },
        [POSE_LM.rightHip]: { x: 0.62, y: 0.54, visibility: V },
      }),
    );
    expect(result.distanceOk).toBe(true);
    expect(result.rejectReason).toBeNull();
  });

  it('rejects for distanceTooClose when the torso spans more than 85% of frame height', () => {
    const result = evaluatePostureFraming(
      goodPosture({
        [POSE_LM.leftShoulder]: { x: 0.35, y: 0.05, visibility: V },
        [POSE_LM.rightShoulder]: { x: 0.65, y: 0.05, visibility: V },
        [POSE_LM.leftHip]: { x: 0.38, y: 0.95, visibility: V },
        [POSE_LM.rightHip]: { x: 0.62, y: 0.95, visibility: V },
      }),
    );
    expect(result.distanceOk).toBe(false);
    expect(result.rejectReason).toBe('distanceTooClose');
  });

  it('treats missing/undefined landmarks as not-ok without throwing', () => {
    expect(() => evaluatePostureFraming(undefined)).not.toThrow();
    const result = evaluatePostureFraming(undefined);
    expect(result.eyesOk).toBe(false);
    expect(result.shouldersHipsOk).toBe(false);
    expect(() => evaluatePostureFraming([])).not.toThrow();
  });

  it('relaxes the hip visibility threshold below shoulders — hips are the weakest-detected torso landmark in practice', () => {
    const result = evaluatePostureFraming(
      goodPosture({
        [POSE_LM.leftHip]: { x: 0.38, y: 0.75, visibility: 0.55 },
        [POSE_LM.rightHip]: { x: 0.62, y: 0.75, visibility: 0.55 },
      }),
    );
    expect(result.shouldersHipsOk).toBe(true);
  });

  it('still requires shoulders at the stricter 0.6 threshold even though hips are relaxed to 0.5', () => {
    const result = evaluatePostureFraming(
      goodPosture({
        [POSE_LM.leftShoulder]: { x: 0.35, y: 0.4, visibility: 0.55 },
      }),
    );
    expect(result.shouldersHipsOk).toBe(false);
  });

  it('exposes the raw computed tilt angle alongside tiltOk', () => {
    const result = evaluatePostureFraming(goodPosture());
    expect(result.tiltDegrees).not.toBeNull();
    expect(result.tiltDegrees).toBeCloseTo(0, 1);
  });

  it('exposes the raw computed torso-height ratio alongside distanceOk', () => {
    const result = evaluatePostureFraming(goodPosture());
    expect(result.torsoHeightRatio).toBeCloseTo(0.35, 2);
  });

  it('corrects shoulder-tilt for a non-square (4:3) frame — a physically near-level stance no longer misreads as tilted', () => {
    const landmarks = goodPosture({
      [POSE_LM.leftShoulder]: { x: 0.35, y: 0.4, visibility: V },
      [POSE_LM.rightShoulder]: { x: 0.65, y: 0.4805, visibility: V },
    });

    // Default (no frame aspect ratio passed) treats normalized x/y as
    // equivalent units — this is the old (buggy) behavior, kept as the
    // default so existing callers/tests are unaffected.
    const uncorrected = evaluatePostureFraming(landmarks);
    expect(uncorrected.tiltOk).toBe(false);
    expect(uncorrected.tiltDegrees).toBeCloseTo(15, 0);

    // This app's camera defaults to a 640x480 (4:3) feed — passing that
    // real aspect ratio recovers the true physical angle (~11.4°), which
    // is comfortably under the 15° threshold.
    const corrected = evaluatePostureFraming(landmarks, 640 / 480);
    expect(corrected.tiltOk).toBe(true);
    expect(corrected.tiltDegrees).toBeCloseTo(11.4, 0);
  });
});
