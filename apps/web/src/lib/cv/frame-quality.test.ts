import { evaluateFrameQuality, type PixelFrame } from './frame-quality';

const SIZE = 20;

function makeFrame(pixel: (x: number, y: number) => number): PixelFrame {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const value = pixel(x, y);
      const offset = (y * SIZE + x) * 4;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return { data, width: SIZE, height: SIZE };
}

describe('evaluateFrameQuality', () => {
  it('flags an all-black frame as too dark', () => {
    const result = evaluateFrameQuality(makeFrame(() => 0));
    expect(result.brightness).toBeCloseTo(0);
    expect(result.isTooDark).toBe(true);
    expect(result.isTooBright).toBe(false);
  });

  it('flags an all-white frame as too bright', () => {
    const result = evaluateFrameQuality(makeFrame(() => 255));
    expect(result.brightness).toBeCloseTo(255);
    expect(result.isTooBright).toBe(true);
    expect(result.isTooDark).toBe(false);
  });

  it('treats a mid-gray frame as neither too dark nor too bright', () => {
    const result = evaluateFrameQuality(makeFrame(() => 128));
    expect(result.isTooDark).toBe(false);
    expect(result.isTooBright).toBe(false);
  });

  it('flags a flat, featureless frame as blurry', () => {
    const result = evaluateFrameQuality(makeFrame(() => 128));
    expect(result.sharpness).toBeCloseTo(0);
    expect(result.isBlurry).toBe(true);
  });

  it('does not flag a high-frequency checkerboard as blurry', () => {
    const result = evaluateFrameQuality(makeFrame((x, y) => ((x + y) % 2 === 0 ? 0 : 255)));
    expect(result.sharpness).toBeGreaterThan(0);
    expect(result.isBlurry).toBe(false);
  });
});
