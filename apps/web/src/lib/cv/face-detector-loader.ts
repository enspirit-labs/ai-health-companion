'use client';

import type { FaceDetector } from '@mediapipe/tasks-vision';

// Reuses the same self-hosted WASM fileset as pose-loader.ts — both are
// `@mediapipe/tasks-vision` tasks and share one WASM runtime.
const WASM_BASE_PATH = '/cv/mediapipe';
const MODEL_ASSET_PATH = '/cv/blaze_face_short_range.tflite';

let faceDetectorPromise: Promise<FaceDetector> | null = null;

async function createFaceDetector(delegate: 'GPU' | 'CPU'): Promise<FaceDetector> {
  const { FilesetResolver, FaceDetector } = await import('@mediapipe/tasks-vision');
  const vision = await FilesetResolver.forVisionTasks(WASM_BASE_PATH);
  return FaceDetector.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_ASSET_PATH, delegate },
    runningMode: 'VIDEO',
  });
}

async function loadFaceDetector(): Promise<FaceDetector> {
  try {
    return await createFaceDetector('GPU');
  } catch {
    return createFaceDetector('CPU');
  }
}

/** Loads MediaPipe's FaceDetector (a real ML model, unlike the Haar cascade
 * this replaced) exactly once and caches the resolved instance. Resets the
 * cache on failure so a later call can retry. */
export function getFaceDetector(): Promise<FaceDetector> {
  if (!faceDetectorPromise) {
    faceDetectorPromise = loadFaceDetector().catch((error: unknown) => {
      faceDetectorPromise = null;
      throw error;
    });
  }
  return faceDetectorPromise;
}
