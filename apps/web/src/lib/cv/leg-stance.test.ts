import { POSE_LM, type Landmark } from './pose-visibility';
import { classifyStance } from './leg-stance';

const VISIBLE = 0.9;

/** Builds a pose with shoulders at a fixed width (0.2) and ankles at the given
 * horizontal gap, so stance = ankleGap / 0.2. Other points are irrelevant. */
function stance(ankleGap: number): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
  lm[POSE_LM.leftShoulder] = { x: 0.4, y: 0.3, visibility: VISIBLE };
  lm[POSE_LM.rightShoulder] = { x: 0.6, y: 0.3, visibility: VISIBLE }; // width 0.2
  const cx = 0.5;
  lm[POSE_LM.leftAnkle] = { x: cx - ankleGap / 2, y: 0.95, visibility: VISIBLE };
  lm[POSE_LM.rightAnkle] = { x: cx + ankleGap / 2, y: 0.95, visibility: VISIBLE };
  return lm;
}

describe('classifyStance', () => {
  it('accepts a shoulder-width stance', () => {
    const r = classifyStance(stance(0.2)); // ratio 1.0
    expect(r.verdict).toBe('ok');
    expect(r.hint).toBeNull();
    expect(r.ratio).toBeCloseTo(1, 5);
  });

  it('flags feet too narrow and suggests widening', () => {
    const r = classifyStance(stance(0.1)); // ratio 0.5 < 0.75
    expect(r.verdict).toBe('too-narrow');
    expect(r.hint).toMatch(/apart|further/i);
  });

  it('flags feet too wide and suggests narrowing', () => {
    const r = classifyStance(stance(0.5)); // ratio 2.5 → clearly too wide
    expect(r.verdict).toBe('too-wide');
    expect(r.hint).toMatch(/closer|together/i);
  });

  it('flags a moderately-wide stance too (warns before an extreme split)', () => {
    // Shoulders span 0.2, ankles 0.32 apart → ratio 1.6, past the 1.5 cutoff.
    const r = classifyStance(stance(0.32));
    expect(r.verdict).toBe('too-wide');
  });

  it('accepts a slightly-wider-than-shoulders stance as ok', () => {
    // ratio 1.3 — a fine squat stance, must NOT be flagged.
    const r = classifyStance(stance(0.26));
    expect(r.verdict).toBe('ok');
  });

  it('returns unknown when an ankle is not visible', () => {
    const lm = stance(0.2);
    lm[POSE_LM.leftAnkle] = { x: 0.4, y: 0.95, visibility: 0.1 };
    const r = classifyStance(lm);
    expect(r.verdict).toBe('unknown');
    expect(r.hint).toBeNull();
    expect(r.ratio).toBeNull();
  });

  it('returns unknown for undefined landmarks without throwing', () => {
    expect(() => classifyStance(undefined)).not.toThrow();
    expect(classifyStance(undefined).verdict).toBe('unknown');
  });

  // Documents WHY callers must only judge stance while the user is standing.
  // This ratio is ankle gap ÷ shoulder width, and mid-squat the denominator
  // shrinks on its own: the torso leans forward, so the shoulders foreshorten in
  // 2D projection while the planted feet do not move. The verdict therefore
  // drifts to 'too-wide' with no change in actual stance. squats-test.tsx gates
  // the rep-counter form check (and the spoken cue) on `phase === 'up'` for this
  // reason — reps were being rejected for a wide stance the user never adopted.
  it('drifts to too-wide when the shoulders foreshorten but the feet have not moved', () => {
    const FEET = 0.26; // a good stance at full shoulder width (ratio 1.3)

    const standing = classifyStance(stance(FEET));
    expect(standing.verdict).toBe('ok');

    // Same feet, shoulders projected ~35% narrower by the forward lean.
    const leaning = stance(FEET);
    leaning[POSE_LM.leftShoulder] = { x: 0.435, y: 0.3, visibility: VISIBLE };
    leaning[POSE_LM.rightShoulder] = { x: 0.565, y: 0.3, visibility: VISIBLE }; // width 0.13

    const descending = classifyStance(leaning);
    expect(descending.ratio).toBeGreaterThan(standing.ratio!);
    expect(descending.verdict).toBe('too-wide');
  });
});
