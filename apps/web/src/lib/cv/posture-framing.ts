import { POSE_LM, type Landmark } from './pose-visibility';

/** Front/side/back orientation + front-view accept sub-checks for the
 * Posture assessment specifically. This is deliberately a SEPARATE detector
 * from `facing-direction.ts` (used by squats-test.tsx) rather than a shared
 * one: squats-test.tsx needs a loose "still roughly facing the camera while
 * exercising" gate (shoulder/torso ratio + nose-offset, both at 0.35), while
 * this needs a strict one-shot intake gate with the specific numbers below.
 * Don't assume the two modules should ever agree on what counts as
 * "sideways" — they're tuned for different jobs. */

export type PostureOrientation = 'front' | 'side' | 'back' | 'undetermined';

export type PostureRejectReason =
  | 'back'
  | 'side'
  | 'eyes'
  | 'ears'
  | 'shouldersHips'
  | 'tilt'
  | 'distanceTooFar'
  | 'distanceTooClose'
  | null;

export interface PostureFramingResult {
  orientation: PostureOrientation;
  eyesOk: boolean;
  earsOk: boolean;
  noseAlignedOk: boolean;
  shouldersHipsOk: boolean;
  tiltOk: boolean;
  distanceOk: boolean;
  /** Raw computed shoulder-tilt angle in degrees (aspect-ratio corrected),
   * or null when both shoulders aren't available to compute it. Exposed
   * alongside `tiltOk` purely for debugging/telemetry — not used for any
   * decision inside this module beyond what `tiltOk` already captures. */
  tiltDegrees: number | null;
  /** Raw computed shoulder-midpoint-to-hip-midpoint span, as a fraction of
   * frame height, or null when shoulders/hips aren't all available to
   * compute it. Exposed alongside `distanceOk` purely for debugging/
   * telemetry, same rationale as `tiltDegrees` above. */
  torsoHeightRatio: number | null;
  /** First failing check in priority order (back > side > front sub-checks),
   * or null when the frame passes as a good front-view shot. */
  rejectReason: PostureRejectReason;
}

// Three different "visible enough" bars appear in this module, each serving
// a different purpose — not an inconsistency:
//  - 0.6: the general "confidently visible" bar used for eyes/shoulders,
//    matching HEAD_VISIBILITY_THRESHOLD/TORSO_VISIBILITY_THRESHOLD in
//    pose-visibility.ts.
//  - 0.5: hips specifically get a lower bar than shoulders — they sit lower
//    in a typical webcam frame and are more often partially cropped or
//    occluded by clothing/desks, so they're the weakest-detected torso
//    landmark in practice. Matches ARMS/LEGS_VISIBILITY_THRESHOLD in
//    pose-visibility.ts, which uses the same "moderate" bar for similarly
//    harder-to-see joints.
//  - 0.4/0.6 together: an ASYMMETRY check between the two ears — one clearly
//    visible while the other clearly isn't is a strong side-view signal,
//    distinct from either ear simply being dim.
//  - 0.2: a near-zero bar meaning "essentially not detected at all", used
//    only to decide the person's face isn't in view whatsoever (back view).
const EYE_VISIBILITY_THRESHOLD = 0.6;
const SHOULDER_VISIBILITY_THRESHOLD = 0.6;
const HIP_VISIBILITY_THRESHOLD = 0.5;
const EAR_VISIBLE_THRESHOLD = 0.6;
const EAR_HIDDEN_THRESHOLD = 0.4;
const EAR_ASYMMETRY_MAX_DIFF = 0.2;
const NOSE_ALIGNMENT_MAX_OFFSET_RATIO = 0.15;
const BACK_VIEW_SHOULDER_VISIBILITY_THRESHOLD = 0.5;
const BACK_VIEW_HIP_VISIBILITY_THRESHOLD = 0.5;
const BACK_VIEW_FACE_ABSENT_THRESHOLD = 0.2;
const SHOULDER_TILT_MAX_DEGREES = 15;
// The front/side capture steps require 'arms' and 'legs' confirmed too (see
// posture-capture.tsx's REQUIRED_REGIONS_FRONT/SIDE), which only clear once
// wrists AND ankles are in frame — i.e. the user's whole body, head to feet.
// Average body proportions put the shoulder-to-hip span at only ~28-29% of
// total standing height, so once the frame is showing a full body (with any
// headroom/footroom margin at all) the torso can never fill 30%+ of the
// frame's height — a MIN_RATIO of 0.3 was unreachable at the same time as
// 'arms'/'legs', which is why the torso pill would confirm reliably on its
// own but never alongside a full-body shot. 0.15 leaves comfortable room for
// a real full-body stance while still catching a subject standing too far
// back to be usefully framed at all.
export const TORSO_HEIGHT_MIN_RATIO = 0.15;
export const TORSO_HEIGHT_MAX_RATIO = 0.85;

function visibility(landmark: Landmark | undefined): number {
  return landmark?.visibility ?? 0;
}

// Mirrors isInFrame() in pose-visibility.ts: MediaPipe extrapolates
// landmarks past the edge of the frame with low (but not always low
// enough) visibility, so accept checks need both the visibility score AND
// the normalized coordinates actually falling within [0, 1].
function inFrame(landmark: Landmark | undefined, threshold: number): boolean {
  if (!landmark) return false;
  const v = landmark.visibility ?? 0;
  return v >= threshold && landmark.x >= 0 && landmark.x <= 1 && landmark.y >= 0 && landmark.y <= 1;
}

function noseOffsetRatio(nose: Landmark | undefined, leftShoulder: Landmark | undefined, rightShoulder: Landmark | undefined): number | null {
  if (!nose || !leftShoulder || !rightShoulder) return null;
  const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);
  if (shoulderWidth === 0) return null;
  const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
  return Math.abs(nose.x - shoulderMidX) / shoulderWidth;
}

/** Angle of the shoulder line from horizontal, in degrees. `frameAspectRatio`
 * (video width / height) corrects for the fact that landmark x and y are
 * each normalized against a *different* dimension — on a non-square feed
 * (the common case: this app's camera defaults to 640x480, a 4:3 frame),
 * computing atan2 directly over the raw normalized dx/dy inflates the
 * apparent tilt by exactly that aspect ratio. Left uncorrected, a person
 * whose shoulders are only mildly and naturally uneven (~11° in reality on
 * a 4:3 feed) reads as a full 15° and gets rejected as "not level" even
 * though they look straight in the actual video. Defaults to 1 (no
 * correction) so existing callers/tests that don't pass it are unaffected. */
function shoulderTiltDegrees(left: Landmark | undefined, right: Landmark | undefined, frameAspectRatio: number = 1): number | null {
  if (!left || !right) return null;
  const dx = Math.abs(left.x - right.x);
  const dy = Math.abs(left.y - right.y) / frameAspectRatio;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

export function evaluatePostureFraming(landmarks: Landmark[] | undefined, frameAspectRatio: number = 1): PostureFramingResult {
  const at = (index: number) => landmarks?.[index];

  const nose = at(POSE_LM.nose);
  const leftEye = at(POSE_LM.leftEye);
  const rightEye = at(POSE_LM.rightEye);
  const leftEar = at(POSE_LM.leftEar);
  const rightEar = at(POSE_LM.rightEar);
  const leftShoulder = at(POSE_LM.leftShoulder);
  const rightShoulder = at(POSE_LM.rightShoulder);
  const leftHip = at(POSE_LM.leftHip);
  const rightHip = at(POSE_LM.rightHip);

  const shoulderHipVisible =
    inFrame(leftShoulder, BACK_VIEW_SHOULDER_VISIBILITY_THRESHOLD) &&
    inFrame(rightShoulder, BACK_VIEW_SHOULDER_VISIBILITY_THRESHOLD) &&
    inFrame(leftHip, BACK_VIEW_HIP_VISIBILITY_THRESHOLD) &&
    inFrame(rightHip, BACK_VIEW_HIP_VISIBILITY_THRESHOLD);

  const faceEntirelyAbsent =
    visibility(nose) < BACK_VIEW_FACE_ABSENT_THRESHOLD &&
    visibility(leftEye) < BACK_VIEW_FACE_ABSENT_THRESHOLD &&
    visibility(rightEye) < BACK_VIEW_FACE_ABSENT_THRESHOLD;

  const leftEarVis = visibility(leftEar);
  const rightEarVis = visibility(rightEar);
  const earAsymmetric =
    (leftEarVis < EAR_HIDDEN_THRESHOLD && rightEarVis > EAR_VISIBLE_THRESHOLD) ||
    (rightEarVis < EAR_HIDDEN_THRESHOLD && leftEarVis > EAR_VISIBLE_THRESHOLD);

  const offsetRatio = noseOffsetRatio(nose, leftShoulder, rightShoulder);
  const noseMisaligned = offsetRatio === null ? true : offsetRatio > NOSE_ALIGNMENT_MAX_OFFSET_RATIO;

  // Back view: torso is confirmed in frame, but there's no face at all.
  if (shoulderHipVisible && faceEntirelyAbsent) {
    return {
      orientation: 'back',
      eyesOk: false,
      earsOk: false,
      noseAlignedOk: false,
      shouldersHipsOk: shoulderHipVisible,
      tiltOk: false,
      distanceOk: false,
      tiltDegrees: null,
      torsoHeightRatio: null,
      rejectReason: 'back',
    };
  }

  // Side view: asymmetric ear visibility, or the nose sitting off to one
  // side of the shoulder midpoint (catches partial turns too).
  if (earAsymmetric || noseMisaligned) {
    return {
      orientation: 'side',
      eyesOk: inFrame(leftEye, EYE_VISIBILITY_THRESHOLD) && inFrame(rightEye, EYE_VISIBILITY_THRESHOLD),
      earsOk: false,
      noseAlignedOk: false,
      shouldersHipsOk: shoulderHipVisible,
      tiltOk: false,
      distanceOk: false,
      tiltDegrees: null,
      torsoHeightRatio: null,
      rejectReason: 'side',
    };
  }

  const eyesOk = inFrame(leftEye, EYE_VISIBILITY_THRESHOLD) && inFrame(rightEye, EYE_VISIBILITY_THRESHOLD);
  const earsOk =
    inFrame(leftEar, EAR_VISIBLE_THRESHOLD) &&
    inFrame(rightEar, EAR_VISIBLE_THRESHOLD) &&
    Math.abs(leftEarVis - rightEarVis) <= EAR_ASYMMETRY_MAX_DIFF;
  const noseAlignedOk = offsetRatio !== null && offsetRatio <= NOSE_ALIGNMENT_MAX_OFFSET_RATIO;
  const shouldersHipsOk =
    inFrame(leftShoulder, SHOULDER_VISIBILITY_THRESHOLD) &&
    inFrame(rightShoulder, SHOULDER_VISIBILITY_THRESHOLD) &&
    inFrame(leftHip, HIP_VISIBILITY_THRESHOLD) &&
    inFrame(rightHip, HIP_VISIBILITY_THRESHOLD);

  const tiltDegrees = shoulderTiltDegrees(leftShoulder, rightShoulder, frameAspectRatio);
  const tiltOk = tiltDegrees !== null && tiltDegrees < SHOULDER_TILT_MAX_DEGREES;

  let distanceOk = false;
  let distanceTooFar = false;
  let torsoHeightRatio: number | null = null;
  if (leftShoulder && rightShoulder && leftHip && rightHip) {
    const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
    const hipMidY = (leftHip.y + rightHip.y) / 2;
    torsoHeightRatio = Math.abs(hipMidY - shoulderMidY);
    distanceOk = torsoHeightRatio >= TORSO_HEIGHT_MIN_RATIO && torsoHeightRatio <= TORSO_HEIGHT_MAX_RATIO;
    distanceTooFar = torsoHeightRatio < TORSO_HEIGHT_MIN_RATIO;
  }

  let rejectReason: PostureRejectReason = null;
  if (!eyesOk) rejectReason = 'eyes';
  else if (!earsOk) rejectReason = 'ears';
  else if (!shouldersHipsOk) rejectReason = 'shouldersHips';
  else if (!tiltOk) rejectReason = 'tilt';
  else if (!distanceOk) rejectReason = distanceTooFar ? 'distanceTooFar' : 'distanceTooClose';

  return {
    orientation: 'front',
    eyesOk,
    earsOk,
    noseAlignedOk,
    shouldersHipsOk,
    tiltOk,
    distanceOk,
    tiltDegrees,
    torsoHeightRatio,
    rejectReason,
  };
}

// --- Side-view (sagittal) capture steps ------------------------------------
//
// A SEPARATE detector from evaluatePostureFraming above, not a mode flag
// bolted onto it — same reasoning as this module's own header comment for why
// it's split from facing-direction.ts: a strict front-view intake gate and a
// strict side-view one are different jobs with different accept geometry,
// and evaluatePostureFraming's front path (and everything that tests it) is
// left completely untouched by everything below.

export type PostureSideRejectReason =
  | 'back'
  | 'notTurned'
  | 'wrongSide'
  | 'nearSideHidden'
  | 'distanceTooFar'
  | 'distanceTooClose'
  | null;

export interface PostureSideFramingResult {
  orientation: PostureOrientation;
  /** True once the frame reads as a genuine profile turned to the requested
   * (expectedSide) direction. */
  turnedToExpectedSide: boolean;
  /** True once the frame reads as a profile turned the OTHER way — distinct
   * from simply "not turnedToExpectedSide", so the reject message can say
   * which specific mistake this is rather than a generic "not right". */
  turnedToWrongSide: boolean;
  /** Near-side (the side facing the camera, matching expectedSide)
   * shoulder+hip visible at the same bar evaluatePostureFraming's own
   * SHOULDER_VISIBILITY_THRESHOLD/HIP_VISIBILITY_THRESHOLD use — reused
   * unchanged, just applied to one side instead of both. */
  nearSideVisible: boolean;
  distanceOk: boolean;
  rejectReason: PostureSideRejectReason;
  /** Raw numbers, exposed purely for debug logging while confirming the
   * left/right convention below and the near-side visibility/distance bars
   * against a real camera — not used in any decision beyond what the
   * booleans above already capture. */
  leftEarVisibility: number;
  rightEarVisibility: number;
  signedNoseOffsetRatio: number | null;
  torsoHeightRatio: number | null;
}

/** Signed version of noseOffsetRatio above (which the front path uses
 * unchanged, still via Math.abs) — kept as its own small helper rather than
 * changing that one's signature, so evaluatePostureFraming's tested behavior
 * can't be affected by anything below. */
function signedNoseOffsetRatio(
  nose: Landmark | undefined,
  leftShoulder: Landmark | undefined,
  rightShoulder: Landmark | undefined,
): number | null {
  if (!nose || !leftShoulder || !rightShoulder) return null;
  const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);
  if (shoulderWidth === 0) return null;
  const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
  return (nose.x - shoulderMidX) / shoulderWidth;
}

/**
 * Evaluates whether the frame shows a genuine profile turned to
 * `expectedSide`, for Posture's left/right capture steps.
 *
 * BEST-EFFORT DIRECTION CONVENTION — not yet confirmed against a real
 * camera, same posture as noseYawOffsetRatio's doc comment in
 * face-framing.ts: presenting the subject's own left side to the camera is
 * assumed to mean the left ear stays visible (facing the camera) while the
 * right ear tucks away, mirroring the subject-relative landmark naming
 * MediaPipe already uses. If real testing shows this backwards, swapping
 * which ear maps to which requested side below (`turnedToShowLeft`/
 * `turnedToShowRight`) is a two-line fix — see posture-capture.tsx's
 * DEBUG_POSTURE_SIDE_LOGGING for the raw numbers to check this against.
 */
export function evaluatePostureSideFraming(
  landmarks: Landmark[] | undefined,
  expectedSide: 'left' | 'right',
  frameAspectRatio: number = 1,
): PostureSideFramingResult {
  const at = (index: number) => landmarks?.[index];

  const nose = at(POSE_LM.nose);
  const leftEye = at(POSE_LM.leftEye);
  const rightEye = at(POSE_LM.rightEye);
  const leftEar = at(POSE_LM.leftEar);
  const rightEar = at(POSE_LM.rightEar);
  const leftShoulder = at(POSE_LM.leftShoulder);
  const rightShoulder = at(POSE_LM.rightShoulder);
  const leftHip = at(POSE_LM.leftHip);
  const rightHip = at(POSE_LM.rightHip);

  const leftEarVis = visibility(leftEar);
  const rightEarVis = visibility(rightEar);

  const nearShoulder = expectedSide === 'left' ? leftShoulder : rightShoulder;
  const nearHip = expectedSide === 'left' ? leftHip : rightHip;
  const nearSideVisible = inFrame(nearShoulder, SHOULDER_VISIBILITY_THRESHOLD) && inFrame(nearHip, HIP_VISIBILITY_THRESHOLD);

  const faceEntirelyAbsent =
    visibility(nose) < BACK_VIEW_FACE_ABSENT_THRESHOLD &&
    visibility(leftEye) < BACK_VIEW_FACE_ABSENT_THRESHOLD &&
    visibility(rightEye) < BACK_VIEW_FACE_ABSENT_THRESHOLD;

  // Same asymmetry signal evaluatePostureFraming uses to detect ANY side
  // turn (earAsymmetric), just read directionally: which ear is the visible
  // one tells us which side is facing the camera.
  const turnedToShowLeft = leftEarVis >= EAR_VISIBLE_THRESHOLD && rightEarVis <= EAR_HIDDEN_THRESHOLD;
  const turnedToShowRight = rightEarVis >= EAR_VISIBLE_THRESHOLD && leftEarVis <= EAR_HIDDEN_THRESHOLD;
  const turnedToExpectedSide = expectedSide === 'left' ? turnedToShowLeft : turnedToShowRight;
  const turnedToWrongSide = expectedSide === 'left' ? turnedToShowRight : turnedToShowLeft;

  const offsetRatio = signedNoseOffsetRatio(nose, leftShoulder, rightShoulder);

  let torsoHeightRatio: number | null = null;
  let distanceOk = false;
  let distanceTooFar = false;
  if (nearShoulder && nearHip) {
    torsoHeightRatio = Math.abs(nearHip.y - nearShoulder.y);
    // Reuses evaluatePostureFraming's own TORSO_HEIGHT_MIN_RATIO/MAX_RATIO
    // unchanged — same distance-from-camera scaling, just measured off one
    // side's shoulder-hip span instead of the bilateral midpoint.
    distanceOk = torsoHeightRatio >= TORSO_HEIGHT_MIN_RATIO && torsoHeightRatio <= TORSO_HEIGHT_MAX_RATIO;
    distanceTooFar = torsoHeightRatio < TORSO_HEIGHT_MIN_RATIO;
  }
  // frameAspectRatio isn't used by any check above yet (side mode drops the
  // shoulder-tilt check entirely — see the module comment for why), but kept
  // as a parameter for call-site symmetry with evaluatePostureFraming and in
  // case a side-specific tilt/lean check is added later.
  void frameAspectRatio;

  let rejectReason: PostureSideRejectReason = null;
  let orientation: PostureOrientation = 'undetermined';

  if (nearSideVisible && faceEntirelyAbsent) {
    orientation = 'back';
    rejectReason = 'back';
  } else if (!turnedToExpectedSide && !turnedToWrongSide) {
    orientation = 'front';
    rejectReason = 'notTurned';
  } else if (turnedToWrongSide) {
    orientation = 'side';
    rejectReason = 'wrongSide';
  } else if (!nearSideVisible) {
    orientation = 'side';
    rejectReason = 'nearSideHidden';
  } else if (!distanceOk) {
    orientation = 'side';
    rejectReason = distanceTooFar ? 'distanceTooFar' : 'distanceTooClose';
  } else {
    orientation = 'side';
  }

  return {
    orientation,
    turnedToExpectedSide,
    turnedToWrongSide,
    nearSideVisible,
    distanceOk,
    rejectReason,
    leftEarVisibility: leftEarVis,
    rightEarVisibility: rightEarVis,
    signedNoseOffsetRatio: offsetRatio,
    torsoHeightRatio,
  };
}
