import { evaluateLightingQuality } from './lighting-quality';
import type { PixelBuffer } from './pixel-analysis';

/** Builds a flat RGBA buffer of the given size, calling `paint(x, y)` for
 * each pixel's normalized position (0-1) to get its grey value. */
function buildBuffer(width: number, height: number, paint: (xNorm: number, yNorm: number) => number): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = paint(x / width, y / height);
      const i = (y * width + x) * 4;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

const SIZE = 64;

describe('evaluateLightingQuality', () => {
  it('passes a uniform, well-lit frame', () => {
    const buffer = buildBuffer(SIZE, SIZE, () => 140);
    expect(evaluateLightingQuality(buffer)).toEqual({ ok: true, reason: null });
  });

  it('flags too_dark below the brightness floor', () => {
    const buffer = buildBuffer(SIZE, SIZE, () => 40);
    expect(evaluateLightingQuality(buffer)).toEqual({ ok: false, reason: 'too_dark' });
  });

  it('flags too_bright above the brightness ceiling', () => {
    const buffer = buildBuffer(SIZE, SIZE, () => 240);
    expect(evaluateLightingQuality(buffer)).toEqual({ ok: false, reason: 'too_bright' });
  });

  it('flags backlit when the border is much brighter than the central/subject region', () => {
    // Outer 20% ring at 200, inner 60% box at 100 — overall average (164)
    // stays comfortably within the brightness band so backlit is what fires.
    const buffer = buildBuffer(SIZE, SIZE, (x, y) => {
      const inBorder = x < 0.2 || x > 0.8 || y < 0.2 || y > 0.8;
      return inBorder ? 200 : 100;
    });
    expect(evaluateLightingQuality(buffer)).toEqual({ ok: false, reason: 'backlit' });
  });

  it('does not flag backlit when border and subject are close in brightness', () => {
    const buffer = buildBuffer(SIZE, SIZE, (x, y) => {
      const inBorder = x < 0.2 || x > 0.8 || y < 0.2 || y > 0.8;
      return inBorder ? 145 : 140;
    });
    expect(evaluateLightingQuality(buffer).ok).toBe(true);
  });

  it('classifies a dim subject with only a moderately-bright (not genuinely bright) background as too_dark, not backlit', () => {
    // Regression case: subject and background are both fairly dim — this is
    // a general low-light problem, not a person silhouetted against a window.
    const buffer = buildBuffer(SIZE, SIZE, (x, y) => {
      const inBorder = x < 0.2 || x > 0.8 || y < 0.2 || y > 0.8;
      return inBorder ? 80 : 40;
    });
    expect(evaluateLightingQuality(buffer)).toEqual({ ok: false, reason: 'too_dark' });
  });

  it('flags too_dark for a dim face even when the background keeps the whole-frame average looking fine', () => {
    // The face box is a small fraction of the frame, so the whole-frame
    // average alone (dominated by a lit background) would miss this.
    const faceBox = { xMin: 0.4, xMax: 0.6, yMin: 0.35, yMax: 0.65 };
    const buffer = buildBuffer(SIZE, SIZE, (x, y) => {
      const inFace = x >= faceBox.xMin && x <= faceBox.xMax && y >= faceBox.yMin && y <= faceBox.yMax;
      return inFace ? 45 : 100;
    });
    expect(evaluateLightingQuality(buffer, faceBox)).toEqual({ ok: false, reason: 'too_dark' });
  });

  it('does not flag backlit for everyday uneven room lighting — background under the genuine-backlight floor', () => {
    // Background (130) is only moderately brighter than the subject (75) —
    // neither side is dark, and the background isn't bright enough (>140) to
    // read as a real light source like a window. This gap (55) would have
    // tripped the old, more sensitive 50-point diff threshold.
    const buffer = buildBuffer(SIZE, SIZE, (x, y) => {
      const inBorder = x < 0.2 || x > 0.8 || y < 0.2 || y > 0.8;
      return inBorder ? 130 : 75;
    });
    expect(evaluateLightingQuality(buffer).ok).toBe(true);
  });

  it('does not flag backlit for a brightness gap that would have tripped the old 50-point threshold', () => {
    // Background (170) clears the genuine-backlight brightness floor (140),
    // but the 70-point gap sits under the new 75-point threshold.
    const buffer = buildBuffer(SIZE, SIZE, (x, y) => {
      const inBorder = x < 0.2 || x > 0.8 || y < 0.2 || y > 0.8;
      return inBorder ? 170 : 100;
    });
    expect(evaluateLightingQuality(buffer).ok).toBe(true);
  });

  it('falls back to full-frame halves for the uneven check when no face box is given', () => {
    const buffer = buildBuffer(SIZE, SIZE, (x) => (x < 0.5 ? 100 : 180));
    expect(evaluateLightingQuality(buffer)).toEqual({ ok: false, reason: 'uneven' });
  });

  it('uses the face box for the uneven check when one is given, instead of the full frame', () => {
    // Even background at 150, with a small asymmetric patch only inside the
    // designated face box (x 0.4-0.6, y 0.3-0.5).
    const faceBox = { xMin: 0.4, xMax: 0.6, yMin: 0.3, yMax: 0.5 };
    const buffer = buildBuffer(SIZE, SIZE, (x, y) => {
      const inFace = x >= faceBox.xMin && x <= faceBox.xMax && y >= faceBox.yMin && y <= faceBox.yMax;
      if (!inFace) return 150;
      return x < (faceBox.xMin + faceBox.xMax) / 2 ? 100 : 180;
    });

    expect(evaluateLightingQuality(buffer, faceBox)).toEqual({ ok: false, reason: 'uneven' });
    // Without the face box, the same frame's full-frame halves are dominated
    // by the even 150 background and shouldn't trip the same check.
    expect(evaluateLightingQuality(buffer, null).ok).toBe(true);
  });

  it('prioritizes too_dark over uneven/backlit when multiple conditions would fail', () => {
    const buffer = buildBuffer(SIZE, SIZE, (x, y) => {
      const inBorder = x < 0.2 || x > 0.8 || y < 0.2 || y > 0.8;
      // Both halves dark, but still asymmetric enough to also qualify as
      // "uneven"/"backlit" if brightness weren't checked first.
      if (inBorder) return 30;
      return x < 0.5 ? 5 : 45;
    });
    expect(evaluateLightingQuality(buffer)).toEqual({ ok: false, reason: 'too_dark' });
  });

  it('prioritizes backlit over uneven when both would fail', () => {
    // Bright border (backlit) with an additionally asymmetric center.
    const buffer = buildBuffer(SIZE, SIZE, (x, y) => {
      const inBorder = x < 0.2 || x > 0.8 || y < 0.2 || y > 0.8;
      if (inBorder) return 210;
      return x < 0.5 ? 100 : 150;
    });
    expect(evaluateLightingQuality(buffer)).toEqual({ ok: false, reason: 'backlit' });
  });

  it('prioritizes too_dark over backlit even with a genuinely bright background, when the subject itself is dark', () => {
    // The border is bright enough (200) and the gap is large enough (170)
    // that this would otherwise read as backlit — but a subject this dark
    // (30) is a "too dark" problem first, per the requested check ordering.
    const buffer = buildBuffer(SIZE, SIZE, (x, y) => {
      const inBorder = x < 0.2 || x > 0.8 || y < 0.2 || y > 0.8;
      return inBorder ? 200 : 30;
    });
    expect(evaluateLightingQuality(buffer)).toEqual({ ok: false, reason: 'too_dark' });
  });

  it('respects custom thresholds', () => {
    const buffer = buildBuffer(SIZE, SIZE, () => 100);
    expect(evaluateLightingQuality(buffer, null, { minBrightness: 120 })).toEqual({ ok: false, reason: 'too_dark' });
    expect(evaluateLightingQuality(buffer, null, { minBrightness: 50 }).ok).toBe(true);
  });
});
