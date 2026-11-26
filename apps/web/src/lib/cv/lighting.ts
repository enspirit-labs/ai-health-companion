/**
 * Pure, dependency-free lighting analysis for camera capture. Given a frame's
 * raw RGBA pixel buffer (from a small canvas's `getImageData().data`), it
 * decides whether the scene is well-lit enough to track the user reliably, and
 * if not, returns a short guidance hint ("move somewhere brighter", …).
 *
 * Kept free of any DOM/MediaPipe imports so the math is trivial to unit-test —
 * same spirit as facing-direction.ts and pose-visibility.ts.
 */

export interface LightingResult {
  /** Mean perceived brightness across sampled pixels, 0–255. */
  brightness: number;
  /** Spread between the 10th and 90th percentile of luma, 0–255. High spread
   * on a usable mean is the classic backlit / harsh side-light case. */
  unevenness: number;
  tooDark: boolean;
  tooBright: boolean;
  uneven: boolean;
  /** True only when none of the above problems are present. */
  ok: boolean;
  /** Short guidance string for UI + voice, or null when `ok`. */
  hint: string | null;
}

/** Tuned against 8-bit luma. Exported so real-world testing can adjust them in
 * one place if the defaults prove too strict or too lax. */
export const LIGHTING_THRESHOLDS = {
  minBrightness: 55,
  maxBrightness: 235,
  /** Percentile luma spread above which a frame is *labelled* uneven. Retained
   * for the informational `unevenness`/`uneven` fields only — see the note in
   * analyzeLighting on why it no longer drives `ok`/`hint`. */
  maxUnevenness: 150,
} as const;

/** Rec. 601 luma — matches how the eye weights R/G/B perceived brightness. */
function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Analyzes a frame's RGBA pixel buffer. `data` is groups of four bytes
 * (r, g, b, a) as produced by CanvasRenderingContext2D.getImageData().
 *
 * `step` samples every Nth pixel (default 4) — full-resolution scanning is
 * wasteful when a coarse sample gives the same verdict. Unevenness uses the
 * 10th–90th percentile spread rather than max−min so a single dark object plus
 * a single blown-out highlight (a sunlit wall corner) doesn't falsely flag an
 * otherwise evenly-lit subject.
 */
export function analyzeLighting(
  data: Uint8ClampedArray | undefined,
  thresholds: typeof LIGHTING_THRESHOLDS = LIGHTING_THRESHOLDS,
  step = 4,
): LightingResult {
  const stride = 4 * Math.max(1, Math.floor(step));

  let sum = 0;
  let count = 0;
  const lumas: number[] = [];

  if (data) {
    for (let i = 0; i + 3 < data.length; i += stride) {
      const value = luma(data[i], data[i + 1], data[i + 2]);
      sum += value;
      count += 1;
      lumas.push(value);
    }
  }

  const brightness = count > 0 ? sum / count : 0;

  let unevenness = 0;
  if (count > 0) {
    lumas.sort((a, b) => a - b);
    const pct = (p: number) => lumas[Math.min(count - 1, Math.floor(p * (count - 1)))];
    unevenness = pct(0.9) - pct(0.1);
  }

  const tooDark = count === 0 || brightness < thresholds.minBrightness;
  const tooBright = count > 0 && brightness > thresholds.maxBrightness;
  // `uneven` is computed for diagnostics but deliberately does NOT affect `ok`
  // or `hint`. A whole-frame luma spread can't tell "person in a normal room"
  // (dark hair/clothing against a bright wall — always high contrast) apart
  // from genuine backlighting, so using it fired "Uneven lighting…" almost
  // constantly even when the light on the subject was fine. Only "too dark" and
  // "too bright" reliably answer "can we see you", so only those guide the user.
  const uneven = !tooDark && unevenness > thresholds.maxUnevenness;
  const ok = !tooDark && !tooBright;

  let hint: string | null = null;
  if (tooDark) hint = 'Too dark to see you — move somewhere brighter';
  else if (tooBright) hint = 'Too much glare — reduce the light or step out of direct sun';

  return { brightness, unevenness, tooDark, tooBright, uneven, ok, hint };
}
