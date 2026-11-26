/** Minimal landmark shape this module needs — structurally matches
 * MediaPipe's `NormalizedLandmark` without importing the package, so this
 * stays a pure, dependency-free module that's trivial to unit test. */
export interface FaceLandmark {
  x: number;
  y: number;
}

export type FaceRegionKey = 'eyes' | 'eyebrows' | 'mouth' | 'jaw';

export interface FaceFramingResult {
  eyes: boolean;
  eyebrows: boolean;
  mouth: boolean;
  jaw: boolean;
  nose: boolean;
  /** Whole-face bounding-box check — distinct from the per-region clip
   * checks above, since e.g. a clipped forehead/hairline could still leave
   * eyes/mouth/nose individually in frame. */
  notClipped: boolean;
  /** Whole-face size check — rejects frames where the face is too far away
   * or too close, independent of any single region's own framing. */
  faceSizeOk: boolean;
  /** Ordered subset of ['eyes', 'eyebrows', 'mouth', 'jaw', 'nose', 'notClipped', 'faceSize'] that failed. */
  missing: string[];
}

export interface FaceFramingOptions {
  /** Fraction of frame width/height treated as the clipping margin at each edge. */
  margin?: number;
  /** Minimum acceptable face width as a fraction of frame width. */
  minWidthRatio?: number;
  /** Maximum acceptable face width as a fraction of frame width. */
  maxWidthRatio?: number;
}

/** Canonical MediaPipe FaceMesh (468/478-point) landmark indices — a compact
 * anchor set per region (corners/extremes) rather than full contours, enough
 * to tell whether that region is clipped by the frame edge. Eye entries are
 * stored as [outer corner, inner corner, top, bottom]. */
export const FACE_LM = {
  rightEye: [33, 133, 159, 145],
  leftEye: [263, 362, 386, 374],
  rightEyebrow: [70, 63, 105, 66, 107],
  leftEyebrow: [300, 293, 334, 296, 336],
  mouth: [61, 291, 13, 14],
  jaw: [152, 172, 397, 136, 365],
  nose: [1],
  /** Forehead-to-chin pair used purely as a stable face-height reference for
   * ratio checks (e.g. mouth-open ratio) — not a "region" with its own pill. */
  faceHeightRef: [10, 152],
} as const;

const DEFAULT_MARGIN = 0.03;
const DEFAULT_MIN_WIDTH_RATIO = 0.25;
const DEFAULT_MAX_WIDTH_RATIO = 0.85;

// Strong head-turn signal: one eye's outer-to-inner corner span shrinking
// relative to the other's, since a turned head foreshortens the far eye.
const EYE_SIZE_SYMMETRY_MIN_RATIO = 0.7;
const EYE_SIZE_SYMMETRY_MAX_RATIO = 1.3;

function pointInBounds(point: FaceLandmark | undefined, margin: number): boolean {
  if (!point) return false;
  return point.x >= margin && point.x <= 1 - margin && point.y >= margin && point.y <= 1 - margin;
}

function regionInFrame(landmarks: FaceLandmark[] | undefined, indices: readonly number[], margin: number): boolean {
  if (!landmarks || landmarks.length === 0) return false;
  return indices.every((index) => pointInBounds(landmarks[index], margin));
}

function boundingBox(landmarks: FaceLandmark[]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of landmarks) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  return { minX, maxX, minY, maxY };
}

/** Whole-face bounding box in normalized [0,1] coordinates. */
export interface FaceBoundingBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Exposed so callers needing pixel-space work (e.g. brightness-symmetry
 * sampling, or drawing a bounding-box overlay) can convert this themselves
 * rather than duplicating this min/max scan. */
export function faceBoundingBox(landmarks: FaceLandmark[] | undefined): FaceBoundingBox | null {
  if (!landmarks || landmarks.length === 0) return null;
  return boundingBox(landmarks);
}

/** Face width as a fraction of frame width — the same figure `faceSizeOk`
 * checks against a range, exposed directly so callers can tell *which*
 * direction a size failure went (too close vs too far) for a specific message. */
export function faceWidthRatio(landmarks: FaceLandmark[] | undefined): number | null {
  const box = faceBoundingBox(landmarks);
  return box ? box.maxX - box.minX : null;
}

export function classifyFaceFraming(
  landmarks: FaceLandmark[] | undefined,
  options: FaceFramingOptions = {},
): FaceFramingResult {
  const margin = options.margin ?? DEFAULT_MARGIN;
  const minWidthRatio = options.minWidthRatio ?? DEFAULT_MIN_WIDTH_RATIO;
  const maxWidthRatio = options.maxWidthRatio ?? DEFAULT_MAX_WIDTH_RATIO;

  const eyes =
    regionInFrame(landmarks, FACE_LM.rightEye, margin) && regionInFrame(landmarks, FACE_LM.leftEye, margin);
  const eyebrows =
    regionInFrame(landmarks, FACE_LM.rightEyebrow, margin) && regionInFrame(landmarks, FACE_LM.leftEyebrow, margin);
  const mouth = regionInFrame(landmarks, FACE_LM.mouth, margin);
  const jaw = regionInFrame(landmarks, FACE_LM.jaw, margin);
  const nose = regionInFrame(landmarks, FACE_LM.nose, margin);

  let faceSizeOk = false;
  let notClipped = false;
  if (landmarks && landmarks.length > 0) {
    const { minX, maxX, minY, maxY } = boundingBox(landmarks);
    const faceWidth = maxX - minX;
    faceSizeOk = faceWidth >= minWidthRatio && faceWidth <= maxWidthRatio;
    notClipped = minX >= margin && maxX <= 1 - margin && minY >= margin && maxY <= 1 - margin;
  }

  const missing: string[] = [];
  if (!eyes) missing.push('eyes');
  if (!eyebrows) missing.push('eyebrows');
  if (!mouth) missing.push('mouth');
  if (!jaw) missing.push('jaw');
  if (!nose) missing.push('nose');
  if (!notClipped) missing.push('notClipped');
  if (!faceSizeOk) missing.push('faceSize');

  return { eyes, eyebrows, mouth, jaw, nose, notClipped, faceSizeOk, missing };
}

function distance(a: FaceLandmark | undefined, b: FaceLandmark | undefined): number | null {
  if (!a || !b) return null;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Compares each eye's outer-to-inner corner span — a strong head-turn
 * foreshortens the far eye relative to the near one. Returns null (treated
 * as "not ok") when landmarks are missing. */
export function eyeSizeSymmetryRatio(landmarks: FaceLandmark[] | undefined): number | null {
  if (!landmarks || landmarks.length === 0) return null;
  const rightSpan = distance(landmarks[FACE_LM.rightEye[0]], landmarks[FACE_LM.rightEye[1]]);
  const leftSpan = distance(landmarks[FACE_LM.leftEye[0]], landmarks[FACE_LM.leftEye[1]]);
  if (rightSpan === null || leftSpan === null || rightSpan === 0 || leftSpan === 0) return null;
  return leftSpan / rightSpan;
}

export function classifyEyeSizeSymmetry(landmarks: FaceLandmark[] | undefined): boolean {
  const ratio = eyeSizeSymmetryRatio(landmarks);
  if (ratio === null) return false;
  return ratio >= EYE_SIZE_SYMMETRY_MIN_RATIO && ratio <= EYE_SIZE_SYMMETRY_MAX_RATIO;
}

/** Vertical gap between the inner upper/lower lip centers, normalized by a
 * forehead-to-chin face-height reference. Returns null (treated as "not
 * open") when landmarks are missing. */
export function mouthOpenRatio(landmarks: FaceLandmark[] | undefined): number | null {
  if (!landmarks || landmarks.length === 0) return null;
  const upperLip = landmarks[FACE_LM.mouth[2]];
  const lowerLip = landmarks[FACE_LM.mouth[3]];
  const faceTop = landmarks[FACE_LM.faceHeightRef[0]];
  const faceBottom = landmarks[FACE_LM.faceHeightRef[1]];
  if (!upperLip || !lowerLip || !faceTop || !faceBottom) return null;
  const faceHeight = Math.abs(faceBottom.y - faceTop.y);
  if (faceHeight === 0) return null;
  return Math.abs(lowerLip.y - upperLip.y) / faceHeight;
}

export function classifyMouthOpenness(landmarks: FaceLandmark[] | undefined, minRatio: number): boolean {
  const ratio = mouthOpenRatio(landmarks);
  if (ratio === null) return false;
  return ratio >= minRatio;
}

/** Bounding box around the mouth's two corners + inner upper/lower lip
 * points (`FACE_LM.mouth`) — used to check the whole mouth is within frame
 * and to draw a mouth-region overlay. A tighter box than `faceBoundingBox`'s
 * full-landmark scan, since it only traces the mouth region. */
export function mouthBoundingBox(landmarks: FaceLandmark[] | undefined): FaceBoundingBox | null {
  if (!landmarks || landmarks.length === 0) return null;
  const points = FACE_LM.mouth.map((index) => landmarks[index]).filter((p): p is FaceLandmark => Boolean(p));
  if (points.length === 0) return null;
  return boundingBox(points);
}

/** Bounding box around the chin/jaw-corner points (`FACE_LM.jaw`) — used for
 * the jaw-region occlusion/motion checks, same pattern as mouthBoundingBox. */
export function jawBoundingBox(landmarks: FaceLandmark[] | undefined): FaceBoundingBox | null {
  if (!landmarks || landmarks.length === 0) return null;
  const points = FACE_LM.jaw.map((index) => landmarks[index]).filter((p): p is FaceLandmark => Boolean(p));
  if (points.length === 0) return null;
  return boundingBox(points);
}

/** Small reference patch centered on mid-forehead — halfway between the
 * hairline anchor (FACE_LM.faceHeightRef[0]) and the eyebrows, so it lands
 * on plain forehead skin regardless of hairline or eyebrow shape. Used as a
 * same-frame "known skin" sample for classifyRegionOcclusionAdaptive(),
 * since the forehead is essentially always visible. Returns null when the
 * required landmarks are missing. */
export function foreheadReferenceBox(landmarks: FaceLandmark[] | undefined): FaceBoundingBox | null {
  if (!landmarks || landmarks.length === 0) return null;
  const top = landmarks[FACE_LM.faceHeightRef[0]];
  const browPoints = [...FACE_LM.leftEyebrow, ...FACE_LM.rightEyebrow]
    .map((index) => landmarks[index])
    .filter((p): p is FaceLandmark => Boolean(p));
  if (!top || browPoints.length === 0) return null;

  const browX = browPoints.reduce((sum, p) => sum + p.x, 0) / browPoints.length;
  const browY = browPoints.reduce((sum, p) => sum + p.y, 0) / browPoints.length;
  const centerX = (top.x + browX) / 2;
  const centerY = (top.y + browY) / 2;
  const halfWidth = 0.06;
  const halfHeight = 0.03;

  return {
    minX: Math.max(0, centerX - halfWidth),
    maxX: Math.min(1, centerX + halfWidth),
    minY: Math.max(0, centerY - halfHeight),
    maxY: Math.min(1, centerY + halfHeight),
  };
}

/** Head tilt (roll) in degrees, derived from the angle of the line between
 * the two eyes' outer corners — 0 is level, sign follows which side is
 * lower. Returns 0 (treated as "level") when landmarks are missing. */
export function headTiltDegrees(landmarks: FaceLandmark[] | undefined): number {
  const right = landmarks?.[FACE_LM.rightEye[0]];
  const left = landmarks?.[FACE_LM.leftEye[0]];
  if (!right || !left) return 0;
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/** Bounding box spanning both eyes (outer/inner corners + top/bottom of
 * each) — wide enough to also cover the nose bridge between them. Used as
 * the sampled region for the eye-occlusion pixel check (a hand/hair
 * covering the eyes reads as suspiciously uniform, same technique as
 * mouthBoundingBox()'s use for the tongue-occlusion check). */
export function eyeBoundingBox(landmarks: FaceLandmark[] | undefined): FaceBoundingBox | null {
  if (!landmarks || landmarks.length === 0) return null;
  const points = [...FACE_LM.rightEye, ...FACE_LM.leftEye]
    .map((index) => landmarks[index])
    .filter((p): p is FaceLandmark => Boolean(p));
  if (points.length === 0) return null;
  return boundingBox(points);
}

/** Signed horizontal offset of the nose tip from the midpoint between the
 * two eyes' outer corners, normalized by the interocular distance (so it's
 * comparable across face sizes/distances) — a head-yaw (turn left/right)
 * proxy. FACE_LM.rightEye/leftEye are named for the SUBJECT's own left/right
 * (MediaPipe's canonical convention), and landmark x runs along the RAW,
 * unmirrored camera frame — since camera and subject face each other, the
 * subject's right eye sits at the smaller raw x. Turning the head to the
 * subject's own left swings the nose tip toward the leftEye side (larger raw
 * x), so positive means "turned left", negative means "turned right". See
 * face-mesh-capture.tsx's DEBUG_EYE_DIRECTION_LOGGING to confirm this sign
 * against a real camera before relying on it for anything higher-stakes.
 * Returns null when the required landmarks are missing or degenerate. */
export function noseYawOffsetRatio(landmarks: FaceLandmark[] | undefined): number | null {
  if (!landmarks || landmarks.length === 0) return null;
  const nose = landmarks[FACE_LM.nose[0]];
  const rightOuter = landmarks[FACE_LM.rightEye[0]];
  const leftOuter = landmarks[FACE_LM.leftEye[0]];
  if (!nose || !rightOuter || !leftOuter) return null;
  const eyeSpan = Math.abs(leftOuter.x - rightOuter.x);
  if (eyeSpan === 0) return null;
  return (nose.x - (rightOuter.x + leftOuter.x) / 2) / eyeSpan;
}

/** Signed vertical offset of the nose tip from the midpoint between eye
 * level and the upper lip, normalized by that same span — a rough head-pitch
 * (look up/down) proxy. 2D-landmark pitch estimation is inherently less
 * reliable than yaw (no equivalent of the interocular-foreshortening signal
 * eyeSizeSymmetryRatio uses), so treat the sign as a best-effort estimate:
 * tilting the head up should swing the nose tip toward eye level (more
 * negative), tilting down should swing it toward/past the mouth (more
 * positive) — confirm against face-mesh-capture.tsx's
 * DEBUG_EYE_DIRECTION_LOGGING output before trusting it blindly. Returns
 * null when the required landmarks are missing or degenerate. */
export function noseVerticalOffsetRatio(landmarks: FaceLandmark[] | undefined): number | null {
  if (!landmarks || landmarks.length === 0) return null;
  const nose = landmarks[FACE_LM.nose[0]];
  const rightEyeTop = landmarks[FACE_LM.rightEye[2]];
  const leftEyeTop = landmarks[FACE_LM.leftEye[2]];
  const upperLip = landmarks[FACE_LM.mouth[2]];
  if (!nose || !rightEyeTop || !leftEyeTop || !upperLip) return null;
  const eyeLevelY = (rightEyeTop.y + leftEyeTop.y) / 2;
  const faceSpan = Math.abs(upperLip.y - eyeLevelY);
  if (faceSpan === 0) return null;
  return (nose.y - (eyeLevelY + upperLip.y) / 2) / faceSpan;
}
