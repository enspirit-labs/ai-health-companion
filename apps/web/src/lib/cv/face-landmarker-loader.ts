'use client';

import type { FaceLandmarker } from '@mediapipe/tasks-vision';

// Self-hosted, same WASM runtime as pose-loader.ts and face-detector-loader.ts.
const WASM_BASE_PATH = '/cv/mediapipe';
const MODEL_ASSET_PATH = '/cv/face_landmarker.task';

// Two faces so the "only one person in frame" check has something to count
// against — one detection alone can't distinguish "nobody else showed up"
// from "we only ever look for one."
const NUM_FACES = 2;

let faceLandmarkerPromise: Promise<FaceLandmarker> | null = null;

// MediaPipe's compiled WASM runtime pipes its own glog-style "INFO:"/
// "WARNING:" lines (e.g. delegate-creation notices, fired lazily on the
// first detectForVideo call rather than at load time) through console.error
// regardless of actual severity. Next.js's dev overlay treats every
// console.error as a reportable error, so this drops only those two
// prefixes — genuine errors never start with them, so still surface as
// normal. Installed once and left in place; there's nothing to undo.
let mediapipeInfoLoggingSuppressed = false;
function suppressMediapipeInfoLogging() {
  if (mediapipeInfoLoggingSuppressed) return;
  mediapipeInfoLoggingSuppressed = true;
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    const message = typeof args[0] === 'string' ? args[0] : '';
    if (/^(INFO|WARNING):/.test(message)) return;
    originalError(...args);
  };
}

async function createFaceLandmarker(delegate: 'GPU' | 'CPU'): Promise<FaceLandmarker> {
  suppressMediapipeInfoLogging();
  const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision');
  const vision = await FilesetResolver.forVisionTasks(WASM_BASE_PATH);
  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_ASSET_PATH, delegate },
    runningMode: 'VIDEO',
    numFaces: NUM_FACES,
    // Enabled for diagnostic logging while evaluating blendshapes as a
    // possible occlusion signal (see face-mesh-capture.tsx's
    // DEBUG_BLENDSHAPE_LOGGING) — not yet used to gate capture. Blendshape
    // scores are computed from the same face-mesh regression that already
    // hallucinates plausible landmarks under occlusion, so they may not add
    // an independent confidence signal; logging real values first before
    // trusting them for anything that blocks a real user.
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: false,
  });
}

async function loadFaceLandmarker(): Promise<FaceLandmarker> {
  try {
    return await createFaceLandmarker('GPU');
  } catch {
    return createFaceLandmarker('CPU');
  }
}

/** Loads MediaPipe's FaceLandmarker (478-point face mesh) exactly once and
 * caches the resolved instance. Resets the cache on failure so a later call
 * can retry. */
export function getFaceLandmarker(): Promise<FaceLandmarker> {
  if (!faceLandmarkerPromise) {
    faceLandmarkerPromise = loadFaceLandmarker().catch((error: unknown) => {
      faceLandmarkerPromise = null;
      throw error;
    });
  }
  return faceLandmarkerPromise;
}
