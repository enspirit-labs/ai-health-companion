import { POSE_LM, type Landmark } from './pose-visibility';
import { classifyFacing } from './facing-direction';

const VISIBLE = 0.9;

/** Builds a 33-entry landmark array with shoulders/hips placed for a normal
 * frontal stance (shoulders at y=0.3, hips at y=0.5, centered on x=0.5, torso
 * height 0.2) and the nose centered between the shoulders — the baseline every
 * test tweaks from. */
function stanceLandmarks(overrides: Record<number, Landmark> = {}): Landmark[] {
  const landmarks: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
  landmarks[POSE_LM.nose] = { x: 0.5, y: 0.25, visibility: VISIBLE };
  landmarks[POSE_LM.leftShoulder] = { x: 0.35, y: 0.3, visibility: VISIBLE };
  landmarks[POSE_LM.rightShoulder] = { x: 0.65, y: 0.3, visibility: VISIBLE };
  landmarks[POSE_LM.leftHip] = { x: 0.4, y: 0.5, visibility: VISIBLE };
  landmarks[POSE_LM.rightHip] = { x: 0.6, y: 0.5, visibility: VISIBLE };
  for (const [index, value] of Object.entries(overrides)) {
    landmarks[Number(index)] = value;
  }
  return landmarks;
}

describe('classifyFacing', () => {
  it('reports forward for a symmetric frontal stance', () => {
    const result = classifyFacing(stanceLandmarks());
    expect(result).toEqual({ direction: 'forward', isFacingForward: true });
  });

  it('reports right when the nose shifts toward the right shoulder', () => {
    const result = classifyFacing(stanceLandmarks({ [POSE_LM.nose]: { x: 0.62, y: 0.25, visibility: VISIBLE } }));
    expect(result).toEqual({ direction: 'right', isFacingForward: false });
  });

  it('reports left when the nose shifts toward the left shoulder', () => {
    const result = classifyFacing(stanceLandmarks({ [POSE_LM.nose]: { x: 0.38, y: 0.25, visibility: VISIBLE } }));
    expect(result).toEqual({ direction: 'left', isFacingForward: false });
  });

  it('reports back when the nose is not visible but the torso reads front-on', () => {
    const result = classifyFacing(stanceLandmarks({ [POSE_LM.nose]: { x: 0.5, y: 0.25, visibility: 0 } }));
    expect(result).toEqual({ direction: 'back', isFacingForward: false });
  });

  it('reports a side turn when shoulders foreshorten relative to torso height (profile), even with a centered nose', () => {
    const result = classifyFacing(
      stanceLandmarks({
        [POSE_LM.leftShoulder]: { x: 0.48, y: 0.3, visibility: VISIBLE },
        [POSE_LM.rightShoulder]: { x: 0.52, y: 0.3, visibility: VISIBLE },
        [POSE_LM.nose]: { x: 0.51, y: 0.25, visibility: VISIBLE },
      }),
    );
    expect(result.isFacingForward).toBe(false);
    expect(result.direction).not.toBe('forward');
  });

  it('reports unknown when torso landmarks are not visible', () => {
    const landmarks: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
    expect(classifyFacing(landmarks)).toEqual({ direction: 'unknown', isFacingForward: false });
  });

  it('reports unknown for an undefined landmark array without throwing', () => {
    expect(() => classifyFacing(undefined)).not.toThrow();
    expect(classifyFacing(undefined)).toEqual({ direction: 'unknown', isFacingForward: false });
  });
});
