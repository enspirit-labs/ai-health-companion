import { POSE_LM, type Landmark } from './pose-visibility';
import { classifyCameraPitch } from './camera-pitch';

const VISIBLE = 0.9;

/** Builds a 33-entry landmark array for an upright standing pose viewed by a
 * LEVEL camera: shoulders at y=0.3, hips at y=0.5 (torso span 0.2), ankles at
 * y=0.8 (leg span 0.3 — a 1.5x leg:torso ratio, EXPECTED_LEG_TO_TORSO). Every
 * test tweaks the ankle (or hip) y from this baseline to simulate pitch. */
function standingLandmarks(overrides: Record<number, Landmark> = {}): Landmark[] {
  const landmarks: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
  landmarks[POSE_LM.leftShoulder] = { x: 0.4, y: 0.3, visibility: VISIBLE };
  landmarks[POSE_LM.rightShoulder] = { x: 0.6, y: 0.3, visibility: VISIBLE };
  landmarks[POSE_LM.leftHip] = { x: 0.42, y: 0.5, visibility: VISIBLE };
  landmarks[POSE_LM.rightHip] = { x: 0.58, y: 0.5, visibility: VISIBLE };
  landmarks[POSE_LM.leftAnkle] = { x: 0.42, y: 0.8, visibility: VISIBLE };
  landmarks[POSE_LM.rightAnkle] = { x: 0.58, y: 0.8, visibility: VISIBLE };
  for (const [index, value] of Object.entries(overrides)) {
    landmarks[Number(index)] = value;
  }
  return landmarks;
}

describe('classifyCameraPitch', () => {
  it('reports level for a standard standing leg:torso ratio', () => {
    const result = classifyCameraPitch(standingLandmarks());
    expect(result).toEqual({ pitch: 'level', isLevelEnough: true });
  });

  it('reports too-high when legs read much shorter than expected (camera angled down)', () => {
    // Leg span shrunk from 0.3 to 0.12 (ratio 0.6, well under the 0.9 lower bound).
    const result = classifyCameraPitch(
      standingLandmarks({
        [POSE_LM.leftAnkle]: { x: 0.42, y: 0.62, visibility: VISIBLE },
        [POSE_LM.rightAnkle]: { x: 0.58, y: 0.62, visibility: VISIBLE },
      }),
    );
    expect(result).toEqual({ pitch: 'too-high', isLevelEnough: false });
  });

  it('reports too-low when legs read much longer than expected (camera angled up)', () => {
    // Leg span stretched from 0.3 to 0.5 (ratio 2.5, well over the 2.1 upper bound).
    const result = classifyCameraPitch(
      standingLandmarks({
        [POSE_LM.leftAnkle]: { x: 0.42, y: 1.0, visibility: VISIBLE },
        [POSE_LM.rightAnkle]: { x: 0.58, y: 1.0, visibility: VISIBLE },
      }),
    );
    expect(result).toEqual({ pitch: 'too-low', isLevelEnough: false });
  });

  it('tolerates moderate ratio drift without flagging', () => {
    // Leg span 0.24 vs torso 0.2 → ratio 1.2, inside the 0.9-2.1 tolerance band.
    const result = classifyCameraPitch(
      standingLandmarks({
        [POSE_LM.leftAnkle]: { x: 0.42, y: 0.74, visibility: VISIBLE },
        [POSE_LM.rightAnkle]: { x: 0.58, y: 0.74, visibility: VISIBLE },
      }),
    );
    expect(result).toEqual({ pitch: 'level', isLevelEnough: true });
  });

  it('reports unknown when ankles are not visible', () => {
    const result = classifyCameraPitch(
      standingLandmarks({
        [POSE_LM.leftAnkle]: { x: 0, y: 0, visibility: 0 },
        [POSE_LM.rightAnkle]: { x: 0, y: 0, visibility: 0 },
      }),
    );
    expect(result).toEqual({ pitch: 'unknown', isLevelEnough: true });
  });

  it('reports unknown when hips are not visible', () => {
    const result = classifyCameraPitch(
      standingLandmarks({
        [POSE_LM.leftHip]: { x: 0, y: 0, visibility: 0 },
        [POSE_LM.rightHip]: { x: 0, y: 0, visibility: 0 },
      }),
    );
    expect(result).toEqual({ pitch: 'unknown', isLevelEnough: true });
  });

  it('reports unknown for an undefined landmark array without throwing', () => {
    expect(() => classifyCameraPitch(undefined)).not.toThrow();
    expect(classifyCameraPitch(undefined)).toEqual({ pitch: 'unknown', isLevelEnough: true });
  });

  it('reports unknown when torso or leg span collapses to zero or negative', () => {
    // Hips at the same y as shoulders — torso span 0, a degenerate/garbage frame.
    const result = classifyCameraPitch(
      standingLandmarks({
        [POSE_LM.leftHip]: { x: 0.42, y: 0.3, visibility: VISIBLE },
        [POSE_LM.rightHip]: { x: 0.58, y: 0.3, visibility: VISIBLE },
      }),
    );
    expect(result).toEqual({ pitch: 'unknown', isLevelEnough: true });
  });
});
