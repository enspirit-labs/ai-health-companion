/**
 * Decides how many people are in the camera frame and which one is the subject
 * of the assessment.
 *
 * The squats test measures ONE person. The detector is configured to return
 * several poses (see `pose-loader.ts`) precisely so a bystander can't be
 * mistaken for the subject: with a single-pose detector the tracker can drift
 * onto whoever is largest at that instant and start counting their movement as
 * the user's reps.
 *
 * Two jobs, kept separate:
 *   1. Pick the primary subject — the person standing closest to the camera,
 *      measured by on-screen body size. That's the person doing the test; a
 *      passer-by further back is smaller in frame.
 *   2. Report whether anyone else is present, so the flow can pause and coach
 *      the user to clear the frame.
 *
 * Pure and dependency-free so the thresholds are unit-tested rather than
 * buried in the rAF loop.
 */

import { POSE_LM, type Landmark } from './pose-visibility';

export interface OccupancyResult {
  /** How many poses counted as a real person this frame (after filtering out
   * low-confidence ghosts). */
  personCount: number;
  /** Index into the ORIGINAL landmarks array of the person being assessed, or
   * null when nobody is present. */
  primaryIndex: number | null;
  /** The primary subject's landmarks, or undefined when nobody is present.
   * Callers should use this in place of `result.landmarks[0]`. */
  primary: Landmark[] | undefined;
  /** True when more than one person is in frame — the assessment must not run. */
  crowded: boolean;
}

export const EMPTY_OCCUPANCY: OccupancyResult = {
  personCount: 0,
  primaryIndex: null,
  primary: undefined,
  crowded: false,
};

/** A detected pose whose core torso points are all below this confidence is
 * treated as a detector artifact (a reflection, a poster, a half-body in the
 * background) rather than a person. Set below the framing thresholds in
 * `pose-visibility.ts` on purpose: someone lurking at the edge of the shot
 * still counts as a second person even though they'd fail our framing bar. */
export const PERSON_CONFIDENCE_THRESHOLD = 0.4;

/** A second person must occupy at least this fraction of the primary subject's
 * on-screen body size to trigger the warning. Someone far in the background of
 * a large room is small in frame and not a tracking risk; a person actually
 * standing near the subject is comparable in size. Guards against warning the
 * user about a housemate walking past a doorway behind them. */
export const SECONDARY_SIZE_RATIO = 0.45;

/** Torso points that define a person's presence and on-screen size. Using the
 * shoulder-to-hip span rather than the full bounding box keeps the measure
 * stable through a squat — the body's height changes a lot as the user drops,
 * but the torso span barely does. */
const TORSO_POINTS = [POSE_LM.leftShoulder, POSE_LM.rightShoulder, POSE_LM.leftHip, POSE_LM.rightHip] as const;

function meanTorsoConfidence(landmarks: Landmark[] | undefined): number {
  if (!landmarks) return 0;
  let sum = 0;
  for (const index of TORSO_POINTS) sum += landmarks[index]?.visibility ?? 0;
  return sum / TORSO_POINTS.length;
}

/**
 * On-screen size of a pose, as the diagonal of its torso box in normalized
 * units. Proxies distance from the camera: nearer person → bigger number.
 */
export function torsoSize(landmarks: Landmark[] | undefined): number {
  if (!landmarks) return 0;
  const leftShoulder = landmarks[POSE_LM.leftShoulder];
  const rightShoulder = landmarks[POSE_LM.rightShoulder];
  const leftHip = landmarks[POSE_LM.leftHip];
  const rightHip = landmarks[POSE_LM.rightHip];
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return 0;

  const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);
  // Shoulder-midpoint to hip-midpoint, so a tilted torso still measures true.
  const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
  const hipY = (leftHip.y + rightHip.y) / 2;
  const torsoHeight = Math.abs(shoulderY - hipY);

  return Math.hypot(shoulderWidth, torsoHeight);
}

/**
 * Classifies the frame's occupants and picks the subject.
 *
 * @param poses every pose the detector returned this frame, in detector order.
 */
export function classifyOccupancy(poses: Landmark[][] | undefined): OccupancyResult {
  if (!poses || poses.length === 0) return EMPTY_OCCUPANCY;

  // Keep only poses confident enough to be a real person, remembering each
  // one's original index so callers can map back to the detector's output.
  const people = poses
    .map((landmarks, index) => ({ landmarks, index, size: torsoSize(landmarks) }))
    .filter((p) => meanTorsoConfidence(p.landmarks) >= PERSON_CONFIDENCE_THRESHOLD && p.size > 0);

  if (people.length === 0) return EMPTY_OCCUPANCY;

  // Largest on screen = closest to the camera = the person taking the test.
  const primary = people.reduce((best, p) => (p.size > best.size ? p : best));

  // Only people of comparable on-screen size count toward crowding; someone
  // small and far away in the background isn't a tracking risk.
  const others = people.filter((p) => p.index !== primary.index && p.size >= primary.size * SECONDARY_SIZE_RATIO);

  return {
    personCount: 1 + others.length,
    primaryIndex: primary.index,
    primary: primary.landmarks,
    crowded: others.length > 0,
  };
}

/** The message shown on screen and spoken aloud when extra people are in
 * frame. Exported so the component and the guidance-cue module stay in sync
 * on the exact wording. */
export const CROWDED_HINT = 'Only one person should be in frame — please ask others to step away';

/** Stable key for the voice manager's debounce/cooldown bookkeeping. */
export const CROWDED_CUE_KEY = 'occupancy-crowded';

/** Shown and spoken when the camera is running but nobody is detected at all.
 * Deliberately an invitation to step INTO view rather than the framing cue's
 * "step back": with an empty frame every body region reads as missing, and
 * telling someone who isn't on camera yet to move backwards is both confusing
 * and the wrong direction. */
export const ABSENT_HINT = 'Step into the frame so I can see you';

/** Stable key for the voice manager's debounce/cooldown bookkeeping. */
export const ABSENT_CUE_KEY = 'occupancy-absent';
