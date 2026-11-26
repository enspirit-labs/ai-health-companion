/** Structural stand-in for the DOM `ImageData` type — lets these functions
 * stay pure and unit-testable with plain arrays, without needing a real
 * canvas/DOM environment. */
export interface PixelBuffer {
  /** Flat RGBA byte array, 4 entries per pixel, row-major. */
  data: ArrayLike<number>;
  width: number;
  height: number;
}

export interface NormalizedBox {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface MouthOcclusionResult {
  /** true when the region looks suspiciously uniform for what should be a
   * high-contrast open-mouth/teeth/tongue area — a proxy for something
   * (hand, hair, shadow) covering it. This is a best-effort heuristic, not a
   * trained classifier: it can be fooled by unusual lighting or skin tone,
   * and should be treated as a soft signal, not ground truth. */
  occluded: boolean;
  stdDev: number;
}

// Luma std-dev (0-255 scale) below this reads as "suspiciously uniform" —
// tuned generously since a real open mouth (teeth/gum/tongue/shadow) almost
// always has far more local contrast than skin or hair covering it.
const DEFAULT_MIN_STD_DEV = 18;

function luma(buffer: PixelBuffer, x: number, y: number): number {
  const index = (y * buffer.width + x) * 4;
  const r = buffer.data[index] ?? 0;
  const g = buffer.data[index + 1] ?? 0;
  const b = buffer.data[index + 2] ?? 0;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// Treats the normalized range as half-open ([min, max)) when converting to
// pixel indices — Math.ceil(max * size) alone would count as inclusive and
// bleed one extra row/column past the requested boundary.
function pixelBounds(buffer: PixelBuffer, xMinNorm: number, xMaxNorm: number, yMinNorm: number, yMaxNorm: number) {
  const xMin = Math.max(0, Math.floor(xMinNorm * buffer.width));
  const xMax = Math.min(buffer.width - 1, Math.ceil(xMaxNorm * buffer.width) - 1);
  const yMin = Math.max(0, Math.floor(yMinNorm * buffer.height));
  const yMax = Math.min(buffer.height - 1, Math.ceil(yMaxNorm * buffer.height) - 1);
  return { xMin, xMax, yMin, yMax };
}

/** Average luma over a normalized-coordinate sub-rectangle. `step` skips
 * pixels for performance on large frames — 1 samples every pixel. */
export function sampleRegionBrightness(
  buffer: PixelBuffer,
  xMinNorm: number,
  xMaxNorm: number,
  yMinNorm: number,
  yMaxNorm: number,
  step = 1,
): number {
  const { xMin, xMax, yMin, yMax } = pixelBounds(buffer, xMinNorm, xMaxNorm, yMinNorm, yMaxNorm);
  let total = 0;
  let count = 0;
  for (let y = yMin; y <= yMax; y += step) {
    for (let x = xMin; x <= xMax; x += step) {
      total += luma(buffer, x, y);
      count += 1;
    }
  }
  return count === 0 ? 0 : total / count;
}

function regionLumaStats(buffer: PixelBuffer, box: NormalizedBox): { mean: number; stdDev: number; isEmpty: boolean } {
  const { xMin, xMax, yMin, yMax } = pixelBounds(buffer, box.xMin, box.xMax, box.yMin, box.yMax);
  const values: number[] = [];
  for (let y = yMin; y <= yMax; y += 1) {
    for (let x = xMin; x <= xMax; x += 1) {
      values.push(luma(buffer, x, y));
    }
  }
  if (values.length === 0) return { mean: 0, stdDev: 0, isEmpty: true };

  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return { mean, stdDev: Math.sqrt(variance), isEmpty: false };
}

/** Best-effort occlusion proxy: a real open mouth (teeth/gums/tongue/shadow)
 * has much more local luma contrast than skin, hair, or a hand covering it.
 * Callers should combine this with a landmark-based mouth-open check —
 * on its own, a closed mouth is also fairly uniform and isn't "occluded". */
export function classifyMouthOcclusion(
  buffer: PixelBuffer,
  mouthBox: NormalizedBox,
  minStdDev: number = DEFAULT_MIN_STD_DEV,
): MouthOcclusionResult {
  const { stdDev, isEmpty } = regionLumaStats(buffer, mouthBox);
  if (isEmpty) return { occluded: true, stdDev: 0 };
  return { occluded: stdDev < minStdDev, stdDev };
}

export interface AdaptiveOcclusionResult {
  /** true when the region reads as both locally uniform AND close in
   * brightness to the same-frame reference patch — i.e. it looks like
   * plain skin rather than an eye/mouth, adapted to THIS frame's actual
   * skin tone and lighting instead of a fixed absolute value. */
  occluded: boolean;
  stdDev: number;
  targetLuma: number;
  referenceLuma: number;
  lumaDiff: number;
}

const DEFAULT_MAX_LUMA_DIFF = 20;

/** Occlusion check that adapts to the current frame's actual skin tone and
 * lighting rather than a fixed guessed brightness value: a region reads as
 * occluded only when it BOTH (a) looks locally uniform (low luma std-dev —
 * a real eye/mouth has far more local contrast than skin, same technique as
 * classifyMouthOcclusion) AND (b) its average brightness closely matches a
 * same-frame reference patch sampled from a region that's essentially
 * always visible (e.g. the forehead). Condition (b) is what makes this
 * "looks like skin", not just "looks flat" — a real eye/mouth that happened
 * to read low-contrast in unusual lighting wouldn't also coincidentally
 * match the forehead's exact brightness, whereas a hand or hair actually
 * covering the region would. Both callers still combine this with whatever
 * landmark-based framing check already applies. */
export function classifyRegionOcclusionAdaptive(
  buffer: PixelBuffer,
  targetBox: NormalizedBox,
  referenceBox: NormalizedBox,
  options: { minStdDev?: number; maxLumaDiff?: number } = {},
): AdaptiveOcclusionResult {
  const minStdDev = options.minStdDev ?? DEFAULT_MIN_STD_DEV;
  const maxLumaDiff = options.maxLumaDiff ?? DEFAULT_MAX_LUMA_DIFF;

  const target = regionLumaStats(buffer, targetBox);
  if (target.isEmpty) {
    return { occluded: true, stdDev: 0, targetLuma: 0, referenceLuma: 0, lumaDiff: 0 };
  }
  const referenceLuma = sampleRegionBrightness(buffer, referenceBox.xMin, referenceBox.xMax, referenceBox.yMin, referenceBox.yMax);
  const lumaDiff = Math.abs(target.mean - referenceLuma);

  return {
    occluded: target.stdDev < minStdDev && lumaDiff <= maxLumaDiff,
    stdDev: target.stdDev,
    targetLuma: target.mean,
    referenceLuma,
    lumaDiff,
  };
}
