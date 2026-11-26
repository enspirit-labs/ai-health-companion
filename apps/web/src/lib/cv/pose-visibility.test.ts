import { classifyPoseVisibility, POSE_LM, type Landmark } from './pose-visibility';

const IN_FRAME = { x: 0.5, y: 0.5, visibility: 0.9 };

/** Builds a 33-entry landmark array with every tracked point fully visible
 * and in frame, so individual tests only need to override what they care about. */
function fullBodyLandmarks(overrides: Record<number, Landmark> = {}): Landmark[] {
  const landmarks: Landmark[] = Array.from({ length: 33 }, () => ({ ...IN_FRAME }));
  // Shoulders need distinct x positions for the tilt check (shoulderWidth
  // must be nonzero) — every other point can share the same IN_FRAME spot.
  landmarks[POSE_LM.leftShoulder] = { x: 0.35, y: 0.5, visibility: 0.9 };
  landmarks[POSE_LM.rightShoulder] = { x: 0.65, y: 0.5, visibility: 0.9 };
  for (const [index, value] of Object.entries(overrides)) {
    landmarks[Number(index)] = value;
  }
  return landmarks;
}

describe('classifyPoseVisibility', () => {
  it('reports everything visible for a full-body frame', () => {
    const result = classifyPoseVisibility(fullBodyLandmarks());
    expect(result).toEqual({ head: true, torso: true, arms: true, legs: true, missing: [] });
  });

  it('flags legs when knees/ankles have low visibility', () => {
    const result = classifyPoseVisibility(
      fullBodyLandmarks({
        [POSE_LM.leftKnee]: { x: 0.5, y: 0.5, visibility: 0.1 },
        [POSE_LM.rightAnkle]: { x: 0.5, y: 0.5, visibility: 0.1 },
      }),
    );
    expect(result.legs).toBe(false);
    expect(result.missing).toEqual(['legs']);
  });

  it('flags arms when elbows/wrists have low visibility', () => {
    const result = classifyPoseVisibility(
      fullBodyLandmarks({
        [POSE_LM.leftElbow]: { x: 0.5, y: 0.5, visibility: 0.1 },
        [POSE_LM.rightWrist]: { x: 0.5, y: 0.5, visibility: 0.1 },
      }),
    );
    expect(result.arms).toBe(false);
    expect(result.missing).toEqual(['arms']);
  });

  it('flags head when the nose is out of the [0,1] coordinate bounds despite high visibility', () => {
    const result = classifyPoseVisibility(
      fullBodyLandmarks({
        [POSE_LM.nose]: { x: 0.5, y: -0.2, visibility: 0.95 },
      }),
    );
    expect(result.head).toBe(false);
    expect(result.missing).toContain('head');
  });

  it('flags head when an ear is below the 0.6 threshold, even though 0.5 would have passed', () => {
    const result = classifyPoseVisibility(
      fullBodyLandmarks({
        [POSE_LM.leftEar]: { x: 0.5, y: 0.5, visibility: 0.55 },
      }),
    );
    expect(result.head).toBe(false);
  });

  it('flags torso when shoulders are individually visible but tilted past the threshold', () => {
    const result = classifyPoseVisibility(
      fullBodyLandmarks({
        [POSE_LM.leftShoulder]: { x: 0.3, y: 0.3, visibility: 0.9 },
        [POSE_LM.rightShoulder]: { x: 0.7, y: 0.5, visibility: 0.9 },
      }),
    );
    // shoulderWidth = 0.4, y diff = 0.2 -> ratio 0.5 > 0.25 threshold
    expect(result.torso).toBe(false);
    expect(result.missing).toContain('torso');
  });

  it('passes torso when shoulder tilt is within the threshold', () => {
    const result = classifyPoseVisibility(
      fullBodyLandmarks({
        [POSE_LM.leftShoulder]: { x: 0.3, y: 0.48, visibility: 0.9 },
        [POSE_LM.rightShoulder]: { x: 0.7, y: 0.5, visibility: 0.9 },
      }),
    );
    // shoulderWidth = 0.4, y diff = 0.02 -> ratio 0.05 <= 0.25 threshold
    expect(result.torso).toBe(true);
  });

  it('treats missing/undefined landmarks as not in frame without throwing', () => {
    expect(() => classifyPoseVisibility(undefined)).not.toThrow();
    expect(classifyPoseVisibility(undefined)).toEqual({
      head: false,
      torso: false,
      arms: false,
      legs: false,
      missing: ['head', 'torso', 'arms', 'legs'],
    });
    expect(() => classifyPoseVisibility([])).not.toThrow();
    expect(classifyPoseVisibility([{ x: 0.5, y: 0.5, visibility: 0.9 }]).torso).toBe(false);
  });

  it('treats an undefined visibility field as 0', () => {
    const result = classifyPoseVisibility(
      fullBodyLandmarks({
        [POSE_LM.nose]: { x: 0.5, y: 0.5 },
      }),
    );
    expect(result.head).toBe(false);
  });

  it('treats the head threshold boundary as visible (>=)', () => {
    const result = classifyPoseVisibility(
      fullBodyLandmarks({
        [POSE_LM.nose]: { x: 0.5, y: 0.5, visibility: 0.6 },
      }),
    );
    expect(result.head).toBe(true);
  });

  it('orders missing as [head, torso, legs] regardless of which are absent', () => {
    const result = classifyPoseVisibility(
      fullBodyLandmarks({
        [POSE_LM.leftAnkle]: { x: 0.5, y: 0.5, visibility: 0 },
        [POSE_LM.nose]: { x: 0.5, y: 0.5, visibility: 0 },
      }),
    );
    expect(result.missing).toEqual(['head', 'legs']);
  });
});
