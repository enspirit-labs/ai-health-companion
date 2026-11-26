import { POSE_LM, type Landmark } from './pose-visibility';

export type CameraPitch = 'level' | 'too-high' | 'too-low' | 'unknown';

export interface PitchResult {
  pitch: CameraPitch;
  isLevelEnough: boolean;
}

const MIN_VISIBILITY = 0.5;

/**
 * Expected leg-to-torso span ratio (hip→ankle ÷ shoulder→hip) for a person
 * standing upright, viewed by a LEVEL camera. Adult proportions put the leg
 * roughly 1.4-1.6x the torso; a person standing further from the camera or
 * closer doesn't change this ratio (both spans scale together), but camera
 * PITCH does: perspective foreshortens whichever end of the body is nearer
 * the lens's own height less than the far end.
 */
const EXPECTED_LEG_TO_TORSO = 1.5;

/**
 * How far the observed ratio may drift from EXPECTED_LEG_TO_TORSO (as a
 * fraction of it) before the camera angle is flagged. Generous on purpose —
 * this coarsely catches "mounted near the floor" or "mounted overhead and
 * tilted down" placements, not moderate desk/tripod height differences that
 * the hip-drop counter's own torso-normalization already tolerates.
 */
const PITCH_TOLERANCE_RATIO = 0.4;

function isVisible(landmark: Landmark | undefined): landmark is Landmark {
  return landmark != null && (landmark.visibility ?? 0) >= MIN_VISIBILITY;
}

/**
 * Estimates whether the camera is angled too far up or down from pose
 * landmarks alone (no device orientation sensor). Two body spans are
 * compared:
 *   - torso span: shoulder midpoint → hip midpoint
 *   - leg span:   hip midpoint → ankle midpoint
 *
 * A LEVEL camera at any distance keeps their ratio near EXPECTED_LEG_TO_TORSO
 * because both spans scale together with distance. A camera angled DOWN at
 * the user (mounted high, tilted down — e.g. propped on a shelf) foreshortens
 * the legs more than the torso, since the leg's far end (the feet) is more
 * steeply below the lens's line of sight than the torso is; the observed
 * ratio drops. A camera angled UP (mounted low — e.g. on the floor) does the
 * reverse and the ratio rises.
 *
 * This is a coarse heuristic, not a precise tilt-angle estimate — good enough
 * to prompt "raise/lower your camera," not to grade exact degrees.
 */
export function classifyCameraPitch(landmarks: Landmark[] | undefined): PitchResult {
  const at = (index: number) => landmarks?.[index];
  const leftShoulder = at(POSE_LM.leftShoulder);
  const rightShoulder = at(POSE_LM.rightShoulder);
  const leftHip = at(POSE_LM.leftHip);
  const rightHip = at(POSE_LM.rightHip);
  const leftAnkle = at(POSE_LM.leftAnkle);
  const rightAnkle = at(POSE_LM.rightAnkle);

  if (
    !isVisible(leftShoulder) ||
    !isVisible(rightShoulder) ||
    !isVisible(leftHip) ||
    !isVisible(rightHip) ||
    !isVisible(leftAnkle) ||
    !isVisible(rightAnkle)
  ) {
    return { pitch: 'unknown', isLevelEnough: true };
  }

  const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
  const hipY = (leftHip.y + rightHip.y) / 2;
  const ankleY = (leftAnkle.y + rightAnkle.y) / 2;

  const torsoSpan = hipY - shoulderY;
  const legSpan = ankleY - hipY;

  if (torsoSpan <= 0 || legSpan <= 0) {
    return { pitch: 'unknown', isLevelEnough: true };
  }

  const ratio = legSpan / torsoSpan;
  const lowerBound = EXPECTED_LEG_TO_TORSO * (1 - PITCH_TOLERANCE_RATIO);
  const upperBound = EXPECTED_LEG_TO_TORSO * (1 + PITCH_TOLERANCE_RATIO);

  if (ratio < lowerBound) {
    // Legs read shorter than expected — camera is angled down at the user.
    return { pitch: 'too-high', isLevelEnough: false };
  }
  if (ratio > upperBound) {
    // Legs read longer than expected — camera is angled up at the user.
    return { pitch: 'too-low', isLevelEnough: false };
  }
  return { pitch: 'level', isLevelEnough: true };
}
