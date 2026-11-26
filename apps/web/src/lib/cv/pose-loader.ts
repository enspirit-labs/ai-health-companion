'use client';

import type { PoseLandmarker } from '@mediapipe/tasks-vision';

// Self-hosted rather than pulled from Google's CDN — keeps a health app's
// camera pipeline first-party and leaves room for a strict CSP later.
const WASM_BASE_PATH = '/cv/mediapipe';
const MODEL_ASSET_PATH = '/cv/pose_landmarker_lite.task';

/** The `Connection` type in @mediapipe/tasks-vision's own .d.ts isn't
 * exported, so this is a structurally-identical stand-in for
 * `PoseLandmarker.POSE_CONNECTIONS`. */
export interface PoseConnection {
  start: number;
  end: number;
}

type TasksVisionModule = typeof import('@mediapipe/tasks-vision');

let tasksVisionModulePromise: Promise<TasksVisionModule> | null = null;
function loadTasksVisionModule(): Promise<TasksVisionModule> {
  if (!tasksVisionModulePromise) {
    tasksVisionModulePromise = import('@mediapipe/tasks-vision');
  }
  return tasksVisionModulePromise;
}

let poseLandmarkerPromise: Promise<PoseLandmarker> | null = null;

/** The assessment is single-person, but the detector must still be allowed to
 * SEE more than one body — with `numPoses: 1` a bystander is invisible to us
 * and, worse, the tracker can silently switch to them mid-set and count their
 * movement as the subject's reps. Detecting extra poses lets us pick the
 * primary subject deliberately (see `occupancy.ts`) and tell the user to clear
 * the frame.
 *
 * Why 3 and not 2: at 2 the budget is exactly "subject + one other", which
 * sounds sufficient but isn't. The detector ranks poses by its own confidence,
 * not by who we consider the subject, so a mid-squat subject (bent, closer to
 * the camera, often detected as more than one candidate) can consume both slots
 * and push a real bystander out of the results entirely. Crowding then reads
 * false during the set while working fine during positioning, where the user
 * stands upright and only occupies one slot — exactly the reported bug. A third
 * slot gives the bystander somewhere to land in both poses. Still capped low:
 * each extra pose costs inference time every frame, and the cue only needs
 * "more than one person", never an exact headcount. */
export const MAX_DETECTED_POSES = 3;

async function createPoseLandmarker(delegate: 'GPU' | 'CPU'): Promise<PoseLandmarker> {
  const { FilesetResolver, PoseLandmarker } = await loadTasksVisionModule();
  const vision = await FilesetResolver.forVisionTasks(WASM_BASE_PATH);
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_ASSET_PATH, delegate },
    runningMode: 'VIDEO',
    numPoses: MAX_DETECTED_POSES,
  });
}

async function loadPoseLandmarker(): Promise<PoseLandmarker> {
  try {
    return await createPoseLandmarker('GPU');
  } catch {
    // GPU delegate init is the most common device-specific failure point;
    // fall back to CPU rather than losing framing guidance entirely.
    return createPoseLandmarker('CPU');
  }
}

/** Loads MediaPipe's PoseLandmarker (WASM + model) exactly once and caches the
 * resolved instance. Resets the cache on failure so a later call can retry. */
export function getPoseLandmarker(): Promise<PoseLandmarker> {
  if (!poseLandmarkerPromise) {
    poseLandmarkerPromise = loadPoseLandmarker().catch((error: unknown) => {
      poseLandmarkerPromise = null;
      throw error;
    });
  }
  return poseLandmarkerPromise;
}

/** The skeleton connection list used to draw the pose overlay — a static
 * property on the PoseLandmarker class, so this piggybacks on the same
 * cached module import rather than pulling in a separate drawing-utils
 * dependency just for a connection list. */
export async function getPoseConnections(): Promise<PoseConnection[]> {
  const { PoseLandmarker } = await loadTasksVisionModule();
  return PoseLandmarker.POSE_CONNECTIONS;
}
