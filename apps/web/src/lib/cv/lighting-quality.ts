import { sampleRegionBrightness, type NormalizedBox, type PixelBuffer } from './pixel-analysis';

/** Shared lighting-quality gate for the camera capture-gate screens
 * (Posture, Face, Eye, Tongue). Distinct from `lighting.ts`'s
 * `analyzeLighting` — that one does a whole-frame brightness/contrast read
 * for Squats' continuous-exercise gate, tuned to different thresholds, and
 * deliberately does NOT gate on frame-wide unevenness (a normal room's
 * dark-hair-against-a-bright-wall contrast always reads as "uneven", so a
 * naive whole-frame spread check nagged constantly). This module solves
 * that differently: the uneven/backlit checks below compare specific
 * *regions* (face-box halves, border vs subject) rather than whole-frame
 * spread, which is what makes them safe to actually gate capture on. */

export type LightingCheckReason = 'too_dark' | 'too_bright' | 'uneven' | 'backlit' | null;

export interface LightingCheckResult {
  ok: boolean;
  reason: LightingCheckReason;
}

export interface LightingCheckOptions {
  minBrightness?: number;
  maxBrightness?: number;
  /** Max absolute (0-255) luma difference allowed between left/right halves
   * of the subject region before it's flagged as unevenly lit. */
  maxHalfDiff?: number;
  /** Max absolute (0-255) amount the border may exceed the subject's
   * luminance by before it's flagged as backlit. */
  maxBacklightDiff?: number;
  /** The border must ITSELF be at least this bright (0-255) before the
   * backlit check even runs — see the comment above classifyBacklit(). */
  minBackgroundBrightnessForBacklight?: number;
}

const DEFAULT_MIN_BRIGHTNESS = 70;
const DEFAULT_MAX_BRIGHTNESS = 220;
const DEFAULT_MAX_HALF_DIFF = 35;
// Raised from 50: 50 fired on everyday uneven room lighting (a normal room
// is rarely perfectly even), not just genuine silhouette-style backlighting.
const DEFAULT_MAX_BACKLIGHT_DIFF = 75;
// A relatively-brighter background isn't enough on its own — a dim room
// with slightly-less-dim corners would still clear a diff-only check. The
// background must be genuinely bright (e.g. a window) in absolute terms too.
const DEFAULT_MIN_BACKGROUND_BRIGHTNESS_FOR_BACKLIGHT = 140;
/** Thickness of each border edge strip, as a fraction of frame width/height. */
const BORDER_THICKNESS = 0.2;

const FULL_FRAME: NormalizedBox = { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
/** Central 60% box — used as the "where the subject is" fallback when no
 * face box is available (e.g. Posture, which has no face detector). */
const CENTRAL_REGION: NormalizedBox = { xMin: 0.2, xMax: 0.8, yMin: 0.2, yMax: 0.8 };

function halfSplit(imageData: PixelBuffer, region: NormalizedBox): { left: number; right: number } {
  const midX = (region.xMin + region.xMax) / 2;
  return {
    left: sampleRegionBrightness(imageData, region.xMin, midX, region.yMin, region.yMax),
    right: sampleRegionBrightness(imageData, midX, region.xMax, region.yMin, region.yMax),
  };
}

/** Average luma of the four 20%-thick edge strips around the frame border.
 * Corners get sampled twice (e.g. top-left is in both the top and left
 * strips) — an acceptable approximation for a coarse, downscaled check
 * rather than a precisely-masked ring. */
function borderLuminance(imageData: PixelBuffer): number {
  const top = sampleRegionBrightness(imageData, 0, 1, 0, BORDER_THICKNESS);
  const bottom = sampleRegionBrightness(imageData, 0, 1, 1 - BORDER_THICKNESS, 1);
  const left = sampleRegionBrightness(imageData, 0, BORDER_THICKNESS, 0, 1);
  const right = sampleRegionBrightness(imageData, 1 - BORDER_THICKNESS, 1, 0, 1);
  return (top + bottom + left + right) / 4;
}

/** Evaluates a single already-sampled frame for lighting quality. Pure and
 * DOM-free (matches pose-visibility.ts/face-framing.ts/posture-framing.ts),
 * so the DOM sampling step lives separately in `sampleLightingImageData`.
 *
 * `faceBox` is optional — pass the detected face bounding box for
 * Face/Eye/Tongue (normalized [0,1] coords, same shape as
 * `face-framing.ts`'s `faceBoundingBox()`); omit it for Posture, which has
 * no face box, and the uneven/backlit checks fall back to full-frame halves
 * and the central 60% region respectively.
 *
 * Checked in priority order — the first failing check wins, since a
 * systemic exposure problem (too dark/bright) makes the more localized
 * checks meaningless. `too_dark` is judged on the WHOLE frame *and* the
 * subject region specifically: on Face/Eye/Tongue the face box is a small
 * fraction of the frame, so a dim face against a moderately-lit background
 * can keep the whole-frame average looking fine — without the
 * subject-specific check that case fell through into a false "backlit"
 * verdict instead of the "too dark" one it actually is. Genuine
 * backlighting additionally requires the background to be bright in
 * absolute terms (not just relatively brighter than an already-dim
 * subject) — see minBackgroundBrightnessForBacklight below. */
export function evaluateLightingQuality(
  imageData: PixelBuffer,
  faceBox?: NormalizedBox | null,
  options: LightingCheckOptions = {},
): LightingCheckResult {
  const minBrightness = options.minBrightness ?? DEFAULT_MIN_BRIGHTNESS;
  const maxBrightness = options.maxBrightness ?? DEFAULT_MAX_BRIGHTNESS;
  const maxHalfDiff = options.maxHalfDiff ?? DEFAULT_MAX_HALF_DIFF;
  const maxBacklightDiff = options.maxBacklightDiff ?? DEFAULT_MAX_BACKLIGHT_DIFF;
  const minBackgroundBrightnessForBacklight =
    options.minBackgroundBrightnessForBacklight ?? DEFAULT_MIN_BACKGROUND_BRIGHTNESS_FOR_BACKLIGHT;

  const overallBrightness = sampleRegionBrightness(imageData, FULL_FRAME.xMin, FULL_FRAME.xMax, FULL_FRAME.yMin, FULL_FRAME.yMax);
  const subjectRegion = faceBox ?? CENTRAL_REGION;
  const subjectLuma = sampleRegionBrightness(imageData, subjectRegion.xMin, subjectRegion.xMax, subjectRegion.yMin, subjectRegion.yMax);

  // A dim subject is "too dark" even if the background pulls the whole-frame
  // average up — see the function comment above for why this matters.
  if (overallBrightness < minBrightness || subjectLuma < minBrightness) {
    return { ok: false, reason: 'too_dark' };
  }
  if (overallBrightness > maxBrightness) return { ok: false, reason: 'too_bright' };

  const borderLuma = borderLuminance(imageData);
  if (borderLuma > minBackgroundBrightnessForBacklight && borderLuma > subjectLuma + maxBacklightDiff) {
    return { ok: false, reason: 'backlit' };
  }

  const { left, right } = halfSplit(imageData, faceBox ?? FULL_FRAME);
  if (Math.abs(left - right) > maxHalfDiff) return { ok: false, reason: 'uneven' };

  return { ok: true, reason: null };
}

/** Read-only introspection for threshold tuning — the same raw samples
 * `evaluateLightingQuality` computes internally (overall/subject/border luma,
 * left/right halves) but doesn't return, since adding fields to
 * `LightingCheckResult` would break every exact-shape `toEqual` assertion in
 * lighting-quality.test.ts. Not used by `evaluateLightingQuality` itself —
 * exists purely so callers can log real numbers while tuning thresholds, same
 * purpose as `CaptureGateTracker.getDebugSnapshot()` /
 * `LivenessTracker.getDebugSnapshot()`. */
export function sampleLightingDebugMetrics(imageData: PixelBuffer, faceBox?: NormalizedBox | null) {
  const subjectRegion = faceBox ?? CENTRAL_REGION;
  const { left, right } = halfSplit(imageData, faceBox ?? FULL_FRAME);
  return {
    overallBrightness: sampleRegionBrightness(imageData, FULL_FRAME.xMin, FULL_FRAME.xMax, FULL_FRAME.yMin, FULL_FRAME.yMax),
    subjectLuma: sampleRegionBrightness(imageData, subjectRegion.xMin, subjectRegion.xMax, subjectRegion.yMin, subjectRegion.yMax),
    borderLuma: borderLuminance(imageData),
    leftHalfLuma: left,
    rightHalfLuma: right,
    usedFaceBox: Boolean(faceBox),
  };
}

/** Draws the current video frame down to a small offscreen canvas and reads
 * it back — downscaling to `size`×`size` (default 64×64) is deliberate:
 * lighting analysis doesn't need full resolution, and this keeps the
 * per-call cost negligible even sampled a few times a second. Returns null
 * if the video has no frame data yet. */
export function sampleLightingImageData(video: HTMLVideoElement, canvas: HTMLCanvasElement, size = 64): ImageData | null {
  if (video.videoWidth === 0) return null;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size);
}

/** Convenience one-call wrapper: samples the video frame and evaluates it.
 * Callers that want to throttle sampling independently of evaluation (as
 * the capture-gate screens do, sampling lighting only every ~500ms since it
 * changes slowly) should call `sampleLightingImageData`/
 * `evaluateLightingQuality` separately instead. */
export function checkLightingQuality(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  faceBox?: NormalizedBox | null,
  options?: LightingCheckOptions,
): LightingCheckResult {
  const imageData = sampleLightingImageData(video, canvas);
  if (!imageData) return { ok: true, reason: null };
  return evaluateLightingQuality(imageData, faceBox, options);
}
