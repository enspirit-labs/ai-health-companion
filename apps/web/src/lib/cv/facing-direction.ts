import { POSE_LM, type Landmark } from './pose-visibility';

export type FacingDirection = 'forward' | 'left' | 'right' | 'back' | 'unknown';

export interface FacingResult {
  direction: FacingDirection;
  isFacingForward: boolean;
}

const MIN_VISIBILITY = 0.5;
/** Nose offset from the shoulder midpoint, as a fraction of shoulder width —
 * beyond this the head has turned noticeably toward one shoulder. */
const MAX_NOSE_OFFSET_RATIO = 0.35;
/** Shoulder width as a fraction of torso height (shoulder-to-hip). A frontal
 * stance keeps this fairly high; turning ~90° toward profile foreshortens the
 * apparent shoulder width toward zero even though torso height barely changes,
 * so this ratio is a distance-invariant way to catch a full side turn. */
const MIN_SHOULDER_WIDTH_TO_TORSO_HEIGHT = 0.35;

function isVisible(landmark: Landmark | undefined): landmark is Landmark {
  return landmark != null && (landmark.visibility ?? 0) >= MIN_VISIBILITY;
}

/** Estimates which way someone is facing relative to the camera, from pose
 * landmarks alone (no dedicated face-orientation model). Two signals combine:
 * - Shoulder/hip width ratio catches a ~90° side-on turn (profile).
 * - Nose position relative to the shoulder midpoint catches a partial turn.
 * - A tracked torso with no visible nose is read as the back being turned,
 *   since BlazePose can't place facial landmarks it can't see.
 * This is a coarse heuristic, not a precise orientation estimate — good enough
 * to prompt "please face the camera," not to grade exact rotation. */
export function classifyFacing(landmarks: Landmark[] | undefined): FacingResult {
  const at = (index: number) => landmarks?.[index];
  const nose = at(POSE_LM.nose);
  const leftShoulder = at(POSE_LM.leftShoulder);
  const rightShoulder = at(POSE_LM.rightShoulder);
  const leftHip = at(POSE_LM.leftHip);
  const rightHip = at(POSE_LM.rightHip);

  if (!isVisible(leftShoulder) || !isVisible(rightShoulder) || !isVisible(leftHip) || !isVisible(rightHip)) {
    return { direction: 'unknown', isFacingForward: false };
  }

  const shoulderWidth = Math.abs(rightShoulder.x - leftShoulder.x);
  const torsoHeight = (leftHip.y + rightHip.y) / 2 - (leftShoulder.y + rightShoulder.y) / 2;

  if (shoulderWidth <= 0 || torsoHeight <= 0) {
    return { direction: 'unknown', isFacingForward: false };
  }

  const isProfile = shoulderWidth / torsoHeight < MIN_SHOULDER_WIDTH_TO_TORSO_HEIGHT;

  if (!isVisible(nose)) {
    return { direction: isProfile ? 'unknown' : 'back', isFacingForward: false };
  }

  const shoulderCenterX = (leftShoulder.x + rightShoulder.x) / 2;
  const noseOffsetRatio = (nose.x - shoulderCenterX) / shoulderWidth;

  if (isProfile || Math.abs(noseOffsetRatio) > MAX_NOSE_OFFSET_RATIO) {
    return { direction: noseOffsetRatio > 0 ? 'right' : 'left', isFacingForward: false };
  }

  return { direction: 'forward', isFacingForward: true };
}
