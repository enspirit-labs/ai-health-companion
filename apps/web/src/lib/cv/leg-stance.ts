import { POSE_LM, type Landmark } from './pose-visibility';

/**
 * Pure, dependency-free stance check: is the user's foot spacing roughly
 * shoulder-width (a good squat stance), too narrow, or too wide? Measured as
 * the ankle horizontal gap relative to shoulder width so it's independent of
 * how far the user stands from the camera.
 *
 * Same spirit as facing-direction.ts / pose-visibility.ts — no DOM/MediaPipe
 * imports, trivial to unit-test.
 */

const MIN_VISIBILITY = 0.5;

export const STANCE_THRESHOLDS = {
  /** Feet closer than this fraction of shoulder width → too narrow. */
  minRatio: 0.75,
  /** Feet wider than this fraction of shoulder width → too wide. A good squat
   * stance is roughly shoulder-to-slightly-wider (ratio ~1–1.4); beyond ~1.5
   * the legs are noticeably too far apart, so we warn sooner rather than only
   * on an extreme split. */
  maxRatio: 1.5,
} as const;

export type StanceVerdict = 'ok' | 'too-narrow' | 'too-wide' | 'unknown';

export interface StanceResult {
  verdict: StanceVerdict;
  /** Ankle gap ÷ shoulder width, or null when not measurable this frame. */
  ratio: number | null;
  /** Coaching cue for UI + voice, or null when the stance is fine/unknown. */
  hint: string | null;
}

function isVisible(landmark: Landmark | undefined): landmark is Landmark {
  return landmark != null && (landmark.visibility ?? 0) >= MIN_VISIBILITY;
}

/**
 * Classifies foot spacing. Requires both shoulders and both ankles visible;
 * returns `unknown` otherwise (e.g. legs out of frame), so the caller can stay
 * quiet rather than guess.
 */
export function classifyStance(
  landmarks: Landmark[] | undefined,
  thresholds: typeof STANCE_THRESHOLDS = STANCE_THRESHOLDS,
): StanceResult {
  const at = (index: number) => landmarks?.[index];
  const lShoulder = at(POSE_LM.leftShoulder);
  const rShoulder = at(POSE_LM.rightShoulder);
  const lAnkle = at(POSE_LM.leftAnkle);
  const rAnkle = at(POSE_LM.rightAnkle);

  if (!isVisible(lShoulder) || !isVisible(rShoulder) || !isVisible(lAnkle) || !isVisible(rAnkle)) {
    return { verdict: 'unknown', ratio: null, hint: null };
  }

  const shoulderWidth = Math.abs(rShoulder.x - lShoulder.x);
  if (shoulderWidth <= 0) return { verdict: 'unknown', ratio: null, hint: null };

  const ankleGap = Math.abs(rAnkle.x - lAnkle.x);
  const ratio = ankleGap / shoulderWidth;

  if (ratio < thresholds.minRatio) {
    return { verdict: 'too-narrow', ratio, hint: 'Move your feet a little further apart' };
  }
  if (ratio > thresholds.maxRatio) {
    return { verdict: 'too-wide', ratio, hint: 'Bring your feet a little closer together' };
  }
  return { verdict: 'ok', ratio, hint: null };
}
