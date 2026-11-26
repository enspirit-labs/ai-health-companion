/** Mirrors the shape of `ImageData` structurally so this module doesn't need
 * a DOM canvas to be unit-tested — callers pass the `.data`/`.width`/`.height`
 * straight off a real `ImageData`, but tests can hand-build a `PixelFrame`. */
export interface PixelFrame {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface FrameQuality {
  /** Average luma, 0 (black) to 255 (white). */
  brightness: number;
  isTooDark: boolean;
  isTooBright: boolean;
  /** Laplacian variance — higher means more high-frequency detail (in focus);
   * a blurry or motion-smeared frame flattens this toward zero. */
  sharpness: number;
  isBlurry: boolean;
}

const DARK_BRIGHTNESS_THRESHOLD = 60;
const BRIGHT_BRIGHTNESS_THRESHOLD = 200;
// Tuned against the 160x160 downscaled snapshot teeth-capture.tsx feeds this
// module — a sharp in-focus face comfortably clears this; a blurry or
// motion-smeared one falls well short.
const BLUR_VARIANCE_THRESHOLD = 15;

function toGrayscale(frame: PixelFrame): Float64Array {
  const gray = new Float64Array(frame.width * frame.height);
  for (let i = 0; i < gray.length; i += 1) {
    const offset = i * 4;
    gray[i] = 0.299 * frame.data[offset] + 0.587 * frame.data[offset + 1] + 0.114 * frame.data[offset + 2];
  }
  return gray;
}

function averageOf(values: Float64Array): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) sum += values[i];
  return sum / values.length;
}

// Discrete Laplacian (4-neighbor) at every interior pixel, then its variance
// across the frame — a standard, cheap focus-measure proxy.
function laplacianVariance(gray: Float64Array, width: number, height: number): number {
  if (width < 3 || height < 3) return 0;

  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const laplacian = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width];
      sum += laplacian;
      sumSq += laplacian * laplacian;
      count += 1;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

export function evaluateFrameQuality(frame: PixelFrame): FrameQuality {
  const gray = toGrayscale(frame);
  const brightness = averageOf(gray);
  const sharpness = laplacianVariance(gray, frame.width, frame.height);

  return {
    brightness,
    isTooDark: brightness < DARK_BRIGHTNESS_THRESHOLD,
    isTooBright: brightness > BRIGHT_BRIGHTNESS_THRESHOLD,
    sharpness,
    isBlurry: sharpness < BLUR_VARIANCE_THRESHOLD,
  };
}
