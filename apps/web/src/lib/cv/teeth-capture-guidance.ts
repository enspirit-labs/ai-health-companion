import { classifyMouthOpenness, faceBoundingBox, headTiltDegrees, mouthBoundingBox, type FaceLandmark } from './face-framing';
import { evaluateFrameQuality, type PixelFrame } from './frame-quality';

export interface TeethCaptureChecks {
  /** Exactly one face, centered, head not tilted. */
  face: boolean;
  /** Mouth fully in frame (not cropped) and open wide enough. */
  mouth: boolean;
  /** Face width within the ~20-40cm distance band. */
  distance: boolean;
  lighting: boolean;
  /** Not blurry and not moving too much. */
  stable: boolean;
}

export interface TeethCaptureFrameInput {
  faceCount: number;
  landmarks: FaceLandmark[] | undefined;
  videoWidth: number;
  videoHeight: number;
  /** Downscaled RGBA snapshot for lighting/sharpness checks — sampled far
   * less often than every tick, so may lag the live landmarks slightly. */
  pixelFrame: PixelFrame | undefined;
  /** Nose-tip movement since a few frames ago, in normalized coordinates. */
  movementDelta: number | undefined;
}

export interface TeethCaptureEvaluation {
  canCapture: boolean;
  /** Single, user-facing instruction — the first failing check, in priority order. */
  instruction: string;
}

const MIN_RESOLUTION_HEIGHT = 720;
// Exported (alongside every other threshold below) purely so
// evaluateTeethCaptureChecks() can compute its own per-check breakdown
// against the exact same numbers evaluateTeethCaptureFrame() blocks on,
// rather than a second, hand-copied set that could drift out of sync.
export const MAX_TILT_DEGREES = 10;
/** How far the face's center may drift from the frame's center, as a
 * fraction of the frame. */
export const CENTER_TOLERANCE = 0.12;
/** Face width as a fraction of frame width. Bounds approximate the spec's
 * 20-40cm camera distance — narrower than this reads as too far away, wider
 * as too close. */
export const MIN_FACE_WIDTH_RATIO = 0.28;
export const MAX_FACE_WIDTH_RATIO = 0.75;
/** Mouth bounding box must not come within this fraction of any frame edge,
 * or it's at risk of being cropped out of the shot. */
export const MOUTH_EDGE_MARGIN = 0.02;
/** Inner-lip-gap ratio (see face-framing.ts's `mouthOpenRatio`) below which
 * the mouth reads as closed (or barely parted) — reuses the same threshold
 * FaceMeshCapture's tongue check uses, since both need a comparably wide-open
 * mouth to show what's behind the lips. */
export const MIN_MOUTH_OPEN_RATIO = 0.045;
/** Nose-tip movement, in normalized coordinates, above which the frame is
 * treated as unstable. */
export const MAX_MOVEMENT_DELTA = 0.01;

function blocked(instruction: string): TeethCaptureEvaluation {
  return { canCapture: false, instruction };
}

// What this deliberately does NOT check, because a face-landmark model plus
// pixel-brightness/sharpness stats can't tell: hands/objects covering the
// mouth, a mask or chewing gum, digital zoom, or filters/virtual effects.
// Those would need a dedicated hand/object detector or image-provenance
// signal this module doesn't have.
export function evaluateTeethCaptureFrame(input: TeethCaptureFrameInput): TeethCaptureEvaluation {
  const { faceCount, landmarks, videoWidth, videoHeight, pixelFrame, movementDelta } = input;

  if (videoWidth > 0 && videoHeight > 0 && videoHeight < MIN_RESOLUTION_HEIGHT) {
    return blocked('Camera resolution is too low — use a camera with at least 720p.');
  }

  if (faceCount > 1) {
    return blocked('Make sure only one person is in frame.');
  }

  const face = faceBoundingBox(landmarks);
  if (faceCount === 0 || !face) {
    return blocked('Center your face in the frame.');
  }

  const faceCenterX = (face.minX + face.maxX) / 2;
  const faceCenterY = (face.minY + face.maxY) / 2;
  if (Math.abs(faceCenterX - 0.5) > CENTER_TOLERANCE || Math.abs(faceCenterY - 0.5) > CENTER_TOLERANCE) {
    return blocked('Center your face.');
  }

  if (Math.abs(headTiltDegrees(landmarks)) > MAX_TILT_DEGREES) {
    return blocked('Straighten your head.');
  }

  const faceWidth = face.maxX - face.minX;
  if (faceWidth < MIN_FACE_WIDTH_RATIO) {
    return blocked('Move closer to the camera.');
  }
  if (faceWidth > MAX_FACE_WIDTH_RATIO) {
    return blocked('Move back from the camera.');
  }

  const mouth = mouthBoundingBox(landmarks);
  const isMouthCropped =
    !mouth ||
    mouth.minX < MOUTH_EDGE_MARGIN ||
    mouth.maxX > 1 - MOUTH_EDGE_MARGIN ||
    mouth.minY < MOUTH_EDGE_MARGIN ||
    mouth.maxY > 1 - MOUTH_EDGE_MARGIN;
  if (isMouthCropped) {
    return blocked('Move back so your whole mouth is visible.');
  }

  if (!classifyMouthOpenness(landmarks, MIN_MOUTH_OPEN_RATIO)) {
    return blocked('Open your mouth wider.');
  }

  if (pixelFrame) {
    const quality = evaluateFrameQuality(pixelFrame);
    if (quality.isTooDark || quality.isTooBright) return blocked('Improve the lighting.');
    if (quality.isBlurry) return blocked('Hold still.');
  }

  if (movementDelta !== undefined && movementDelta > MAX_MOVEMENT_DELTA) {
    return blocked('Hold still.');
  }

  return { canCapture: true, instruction: 'Perfect! Hold still while we capture your image.' };
}

/** Structured per-check breakdown alongside evaluateTeethCaptureFrame()'s
 * single combined verdict — computed from the exact same thresholds/helpers,
 * so the premium scan UI's status badges can show which specific thing is
 * unmet instead of only the first-failing-check text. Purely additive: never
 * changes evaluateTeethCaptureFrame()'s own canCapture/instruction behavior. */
export function evaluateTeethCaptureChecks(input: TeethCaptureFrameInput): TeethCaptureChecks {
  const { faceCount, landmarks, pixelFrame, movementDelta } = input;

  const face = faceBoundingBox(landmarks);
  const centeredOk =
    Boolean(face) &&
    Math.abs((face!.minX + face!.maxX) / 2 - 0.5) <= CENTER_TOLERANCE &&
    Math.abs((face!.minY + face!.maxY) / 2 - 0.5) <= CENTER_TOLERANCE;
  const tiltOk = Math.abs(headTiltDegrees(landmarks)) <= MAX_TILT_DEGREES;

  const faceWidth = face ? face.maxX - face.minX : 0;
  const distanceOk = Boolean(face) && faceWidth >= MIN_FACE_WIDTH_RATIO && faceWidth <= MAX_FACE_WIDTH_RATIO;

  const mouth = mouthBoundingBox(landmarks);
  const mouthNotCroppedOk =
    Boolean(mouth) &&
    mouth!.minX >= MOUTH_EDGE_MARGIN &&
    mouth!.maxX <= 1 - MOUTH_EDGE_MARGIN &&
    mouth!.minY >= MOUTH_EDGE_MARGIN &&
    mouth!.maxY <= 1 - MOUTH_EDGE_MARGIN;
  const mouthOpenOk = classifyMouthOpenness(landmarks, MIN_MOUTH_OPEN_RATIO);

  const quality = pixelFrame ? evaluateFrameQuality(pixelFrame) : null;
  const lightingOk = quality ? !quality.isTooDark && !quality.isTooBright : true;
  const notBlurryOk = quality ? !quality.isBlurry : true;
  const notMovingOk = movementDelta === undefined || movementDelta <= MAX_MOVEMENT_DELTA;

  return {
    face: faceCount === 1 && Boolean(face) && centeredOk && tiltOk,
    mouth: mouthNotCroppedOk && mouthOpenOk,
    distance: distanceOk,
    lighting: lightingOk,
    stable: notBlurryOk && notMovingOk,
  };
}
