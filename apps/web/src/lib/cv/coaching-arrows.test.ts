import { POSE_LM, type Landmark } from './pose-visibility';
import { computeArrowHints } from './coaching-arrows';

const VISIBLE = 0.9;

/** Full-body pose with hips + ankles set; other points irrelevant. */
function pose(): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
  lm[POSE_LM.leftHip] = { x: 0.45, y: 0.55, visibility: VISIBLE };
  lm[POSE_LM.rightHip] = { x: 0.55, y: 0.55, visibility: VISIBLE };
  lm[POSE_LM.leftAnkle] = { x: 0.4, y: 0.95, visibility: VISIBLE };
  lm[POSE_LM.rightAnkle] = { x: 0.6, y: 0.95, visibility: VISIBLE };
  return lm;
}

describe('computeArrowHints', () => {
  it('shows a single down arrow at the hips when depth is needed', () => {
    const hints = computeArrowHints({ landmarks: pose(), stance: 'ok', needsDepth: true });
    expect(hints).toHaveLength(1);
    expect(hints[0].direction).toBe('down');
    expect(hints[0].x).toBeCloseTo(0.5, 5); // hip midpoint
    expect(hints[0].y).toBeCloseTo(0.55, 5);
  });

  it('shows inward arrows at both ankles when the stance is too wide', () => {
    const hints = computeArrowHints({ landmarks: pose(), stance: 'too-wide', needsDepth: false });
    expect(hints).toHaveLength(2);
    expect(hints.every((h) => h.direction === 'in')).toBe(true);
    expect(hints.map((h) => h.x).sort()).toEqual([0.4, 0.6]);
  });

  it('shows outward arrows at both ankles when the stance is too narrow', () => {
    const hints = computeArrowHints({ landmarks: pose(), stance: 'too-narrow', needsDepth: false });
    expect(hints).toHaveLength(2);
    expect(hints.every((h) => h.direction === 'out')).toBe(true);
  });

  it('combines a depth arrow with feet arrows', () => {
    const hints = computeArrowHints({ landmarks: pose(), stance: 'too-wide', needsDepth: true });
    expect(hints).toHaveLength(3);
    expect(hints.filter((h) => h.direction === 'down')).toHaveLength(1);
    expect(hints.filter((h) => h.direction === 'in')).toHaveLength(2);
  });

  it('shows nothing when form is fine', () => {
    const hints = computeArrowHints({ landmarks: pose(), stance: 'ok', needsDepth: false });
    expect(hints).toHaveLength(0);
  });

  it('omits feet arrows when ankles are not visible', () => {
    const lm = pose();
    lm[POSE_LM.leftAnkle] = { ...lm[POSE_LM.leftAnkle], visibility: 0.1 };
    const hints = computeArrowHints({ landmarks: lm, stance: 'too-wide', needsDepth: false });
    expect(hints).toHaveLength(0);
  });

  it('omits the depth arrow when hips are not visible', () => {
    const lm = pose();
    lm[POSE_LM.leftHip] = { ...lm[POSE_LM.leftHip], visibility: 0.1 };
    const hints = computeArrowHints({ landmarks: lm, stance: 'ok', needsDepth: true });
    expect(hints).toHaveLength(0);
  });

  it('does not throw on undefined landmarks', () => {
    expect(() => computeArrowHints({ landmarks: undefined, stance: 'too-wide', needsDepth: true })).not.toThrow();
    expect(computeArrowHints({ landmarks: undefined, stance: 'too-wide', needsDepth: true })).toEqual([]);
  });
});
