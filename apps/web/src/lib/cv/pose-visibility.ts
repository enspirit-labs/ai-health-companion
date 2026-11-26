/** Minimal landmark shape this module needs — matches MediaPipe's
 * `NormalizedLandmark` structurally without importing the package, so this
 * stays a pure, dependency-free module that's trivial to unit test. */
export interface Landmark {
  x: number;
  y: number;
  visibility?: number;
}

export interface PoseVisibilityResult {
  head: boolean;
  torso: boolean;
  arms: boolean;
  legs: boolean;
  /** Ordered subset of ['head', 'torso', 'arms', 'legs'] that is not fully in frame. */
  missing: string[];
}

/** Which of Posture's capture steps this check is being run for — 'front'
 * (default, unchanged behavior) requires both arms/both legs the way a
 * front-on shot always could; 'left'/'right' requires only that side's arm
 * and leg, since the far-side limb is genuinely self-occluded in a real
 * profile stance and bilateral visibility would rarely clear. */
export type PoseCaptureOrientation = 'front' | 'left' | 'right';

/** BlazePose (33-point) landmark indices relevant to framing checks. */
export const POSE_LM = {
  nose: 0,
  leftEye: 2,
  rightEye: 5,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

/** Per-region visibility thresholds — head and torso are held to a stricter
 * bar since a misframed head/torso undermines the whole assessment, while a
 * partially-obscured elbow or knee is more tolerable. */
export const HEAD_VISIBILITY_THRESHOLD = 0.6;
export const TORSO_VISIBILITY_THRESHOLD = 0.6;
export const ARMS_VISIBILITY_THRESHOLD = 0.5;
export const LEGS_VISIBILITY_THRESHOLD = 0.5;

/** Kept for backward compatibility with callers that don't care about
 * per-region thresholds. */
export const VISIBILITY_THRESHOLD = 0.5;

/** Shoulders tilted past this fraction of the shoulder width (e.g. camera
 * angled, or standing sideways) read as bad torso framing even when both
 * shoulder points are individually visible. */
export const SHOULDER_TILT_THRESHOLD = 0.25;

// MediaPipe extrapolates landmarks past the edge of the frame with low
// visibility rather than omitting them, so a visibility score alone isn't
// enough to know a body part is actually in frame — the normalized
// coordinates must also fall within the visible [0, 1] bounds.
function isInFrame(landmark: Landmark | undefined, threshold: number): boolean {
  if (!landmark) return false;
  const visibility = landmark.visibility ?? 0;
  return visibility >= threshold && landmark.x >= 0 && landmark.x <= 1 && landmark.y >= 0 && landmark.y <= 1;
}

function shoulderTiltOk(left: Landmark | undefined, right: Landmark | undefined): boolean {
  if (!left || !right) return false;
  const shoulderWidth = Math.abs(left.x - right.x);
  if (shoulderWidth === 0) return false;
  return Math.abs(left.y - right.y) / shoulderWidth <= SHOULDER_TILT_THRESHOLD;
}

export function classifyPoseVisibility(
  landmarks: Landmark[] | undefined,
  orientation: PoseCaptureOrientation = 'front',
): PoseVisibilityResult {
  const at = (index: number) => landmarks?.[index];
  const visible = (index: number, threshold: number) => isInFrame(at(index), threshold);

  const head =
    visible(POSE_LM.nose, HEAD_VISIBILITY_THRESHOLD) &&
    visible(POSE_LM.leftEye, HEAD_VISIBILITY_THRESHOLD) &&
    visible(POSE_LM.rightEye, HEAD_VISIBILITY_THRESHOLD) &&
    visible(POSE_LM.leftEar, HEAD_VISIBILITY_THRESHOLD) &&
    visible(POSE_LM.rightEar, HEAD_VISIBILITY_THRESHOLD);

  const torso =
    visible(POSE_LM.leftShoulder, TORSO_VISIBILITY_THRESHOLD) &&
    visible(POSE_LM.rightShoulder, TORSO_VISIBILITY_THRESHOLD) &&
    visible(POSE_LM.leftHip, TORSO_VISIBILITY_THRESHOLD) &&
    visible(POSE_LM.rightHip, TORSO_VISIBILITY_THRESHOLD) &&
    shoulderTiltOk(at(POSE_LM.leftShoulder), at(POSE_LM.rightShoulder));

  // Same visibility bars as the front-on bilateral check below — only which
  // side's landmarks get checked changes. Reusing ARMS/LEGS_VISIBILITY_THRESHOLD
  // unchanged means this isn't introducing an unverified new number, just
  // relaxing which landmarks a genuine profile stance is held to.
  const arms =
    orientation === 'front'
      ? visible(POSE_LM.leftElbow, ARMS_VISIBILITY_THRESHOLD) &&
        visible(POSE_LM.rightElbow, ARMS_VISIBILITY_THRESHOLD) &&
        visible(POSE_LM.leftWrist, ARMS_VISIBILITY_THRESHOLD) &&
        visible(POSE_LM.rightWrist, ARMS_VISIBILITY_THRESHOLD)
      : orientation === 'left'
        ? visible(POSE_LM.leftElbow, ARMS_VISIBILITY_THRESHOLD) && visible(POSE_LM.leftWrist, ARMS_VISIBILITY_THRESHOLD)
        : visible(POSE_LM.rightElbow, ARMS_VISIBILITY_THRESHOLD) && visible(POSE_LM.rightWrist, ARMS_VISIBILITY_THRESHOLD);

  const legs =
    orientation === 'front'
      ? visible(POSE_LM.leftKnee, LEGS_VISIBILITY_THRESHOLD) &&
        visible(POSE_LM.rightKnee, LEGS_VISIBILITY_THRESHOLD) &&
        visible(POSE_LM.leftAnkle, LEGS_VISIBILITY_THRESHOLD) &&
        visible(POSE_LM.rightAnkle, LEGS_VISIBILITY_THRESHOLD)
      : orientation === 'left'
        ? visible(POSE_LM.leftKnee, LEGS_VISIBILITY_THRESHOLD) && visible(POSE_LM.leftAnkle, LEGS_VISIBILITY_THRESHOLD)
        : visible(POSE_LM.rightKnee, LEGS_VISIBILITY_THRESHOLD) && visible(POSE_LM.rightAnkle, LEGS_VISIBILITY_THRESHOLD);

  const missing: string[] = [];
  if (!head) missing.push('head');
  if (!torso) missing.push('torso');
  if (!arms) missing.push('arms');
  if (!legs) missing.push('legs');

  return { head, torso, arms, legs, missing };
}
