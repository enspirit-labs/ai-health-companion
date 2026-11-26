import { POSE_LM, type Landmark } from './pose-visibility';

/**
 * Pure, dependency-free walking-posture (gait) checks. Given one frame of pose
 * landmarks, reports which postural faults are visible right now so the UI can
 * flag them in red and the voice cue can coach the correction.
 *
 * All measurements are normalized against a body dimension present in the SAME
 * frame (shoulder width or torso height) so verdicts don't change with how far
 * the user stands from the camera or how tall they are.
 *
 * Deliberately separate from `posture-framing.ts`: that module is a strict
 * one-shot INTAKE gate deciding whether a still front-view shot is usable at
 * all. This one runs continuously DURING movement and grades posture quality,
 * so it must tolerate the natural asymmetry of a walking body (a trailing arm,
 * a lifted knee) that the intake gate would reject outright.
 */

const MIN_VISIBILITY = 0.5;

export const WALKING_POSTURE_THRESHOLDS = {
  /** Shoulder tilt as |Δy| ÷ shoulder width. Walking rocks the shoulders a
   * little, so this sits looser than posture-framing.ts's 15° intake bar. */
  maxShoulderTiltRatio: 0.22,
  /** Hip tilt as |Δy| ÷ hip width. Excess is a hip-drop (Trendelenburg-like)
   * pattern worth surfacing. */
  maxHipTiltRatio: 0.22,
  /** Lateral lean: shoulder midpoint offset from hip midpoint, ÷ shoulder
   * width. Beyond this the trunk is listing to one side. */
  maxLateralLeanRatio: 0.18,
  /** Forward head: nose offset from the shoulder midpoint, ÷ shoulder width.
   * Front-on this reads as the head carried off-centre / craned. */
  maxHeadOffsetRatio: 0.22,
  /** Trunk flexion: how far the shoulder midpoint sits in front of/behind the
   * hips is invisible front-on, so we instead use torso height shrinkage —
   * torso height ÷ shoulder width. Dropping below this means the trunk is
   * folding forward (foreshortened torso). */
  minTorsoAspectRatio: 0.9,
} as const;

/** Every fault this module can report. `ok` means no fault detected. */
export type WalkingFaultKind =
  | 'shoulder-tilt'
  | 'hip-drop'
  | 'lateral-lean'
  | 'head-forward'
  | 'trunk-flexion';

export interface WalkingFault {
  kind: WalkingFaultKind;
  /** Short label for the red on-screen chip. */
  label: string;
  /** Corrective coaching cue — used for both the red banner and the voice. */
  hint: string;
  /** How far past the threshold this fault is, as a ratio (1 = exactly at the
   * limit). Used to rank which single fault to speak/show first. */
  severity: number;
}

export interface WalkingPostureResult {
  /** True when the frame was measurable (key landmarks visible). When false,
   * `faults` is always empty — absence of faults is not a pass. */
  measured: boolean;
  /** All faults visible this frame, worst first. */
  faults: WalkingFault[];
  /** The single worst fault, or null when none/unmeasurable. */
  primary: WalkingFault | null;
  /** 0–100 posture quality for this frame; 100 when measured and clean. */
  score: number;
}

function isVisible(landmark: Landmark | undefined): landmark is Landmark {
  return landmark != null && (landmark.visibility ?? 0) >= MIN_VISIBILITY;
}

function midpoint(a: Landmark, b: Landmark): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

const UNMEASURED: WalkingPostureResult = { measured: false, faults: [], primary: null, score: 0 };

/**
 * Analyzes one frame of walking posture. Requires both shoulders and both hips
 * visible; returns `measured: false` otherwise so the caller stays quiet rather
 * than guessing (e.g. mid-stride with the torso occluded).
 */
export function analyzeWalkingPosture(
  landmarks: Landmark[] | undefined,
  thresholds: typeof WALKING_POSTURE_THRESHOLDS = WALKING_POSTURE_THRESHOLDS,
): WalkingPostureResult {
  const at = (index: number) => landmarks?.[index];
  const lShoulder = at(POSE_LM.leftShoulder);
  const rShoulder = at(POSE_LM.rightShoulder);
  const lHip = at(POSE_LM.leftHip);
  const rHip = at(POSE_LM.rightHip);

  if (!isVisible(lShoulder) || !isVisible(rShoulder) || !isVisible(lHip) || !isVisible(rHip)) {
    return UNMEASURED;
  }

  const shoulderWidth = Math.abs(rShoulder.x - lShoulder.x);
  const hipWidth = Math.abs(rHip.x - lHip.x);
  if (shoulderWidth <= 0) return UNMEASURED;

  const shoulderMid = midpoint(lShoulder, rShoulder);
  const hipMid = midpoint(lHip, rHip);
  const faults: WalkingFault[] = [];

  // Shoulders level?
  const shoulderTilt = Math.abs(lShoulder.y - rShoulder.y) / shoulderWidth;
  if (shoulderTilt > thresholds.maxShoulderTiltRatio) {
    faults.push({
      kind: 'shoulder-tilt',
      label: 'Uneven shoulders',
      hint: 'Level your shoulders — keep them square as you walk',
      severity: shoulderTilt / thresholds.maxShoulderTiltRatio,
    });
  }

  // Hips level? Skipped when hips are edge-on (hipWidth ~0), where the ratio
  // explodes and would fire spuriously.
  if (hipWidth > 0) {
    const hipTilt = Math.abs(lHip.y - rHip.y) / hipWidth;
    if (hipTilt > thresholds.maxHipTiltRatio) {
      faults.push({
        kind: 'hip-drop',
        label: 'Hip dropping',
        hint: 'Keep your hips level — avoid dropping one side',
        severity: hipTilt / thresholds.maxHipTiltRatio,
      });
    }
  }

  // Trunk listing to one side?
  const lateralLean = Math.abs(shoulderMid.x - hipMid.x) / shoulderWidth;
  if (lateralLean > thresholds.maxLateralLeanRatio) {
    faults.push({
      kind: 'lateral-lean',
      label: 'Leaning sideways',
      hint: 'Straighten up — you’re leaning to one side',
      severity: lateralLean / thresholds.maxLateralLeanRatio,
    });
  }

  // Head carried off-centre / craned forward.
  const nose = at(POSE_LM.nose);
  if (isVisible(nose)) {
    const headOffset = Math.abs(nose.x - shoulderMid.x) / shoulderWidth;
    if (headOffset > thresholds.maxHeadOffsetRatio) {
      faults.push({
        kind: 'head-forward',
        label: 'Head off-centre',
        hint: 'Bring your head up and centred over your shoulders',
        severity: headOffset / thresholds.maxHeadOffsetRatio,
      });
    }
  }

  // Trunk folding forward — a foreshortened torso relative to its width.
  const torsoHeight = Math.abs(hipMid.y - shoulderMid.y);
  const torsoAspect = torsoHeight / shoulderWidth;
  if (torsoAspect < thresholds.minTorsoAspectRatio) {
    faults.push({
      kind: 'trunk-flexion',
      label: 'Hunched forward',
      hint: 'Stand tall — lift your chest and stop hunching forward',
      severity: thresholds.minTorsoAspectRatio / Math.max(torsoAspect, 0.01),
    });
  }

  faults.sort((a, b) => b.severity - a.severity);

  // Each visible fault costs 20 points, scaled by how far past the limit it is
  // (capped so a single extreme fault can't zero out an otherwise fine frame).
  const penalty = faults.reduce((sum, f) => sum + Math.min(f.severity, 2) * 20, 0);
  const score = Math.max(0, Math.round(100 - penalty));

  return { measured: true, faults, primary: faults[0] ?? null, score };
}
