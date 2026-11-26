import { classifyMouthOcclusion, classifyRegionOcclusionAdaptive, sampleRegionBrightness, type PixelBuffer } from './pixel-analysis';

/** Builds a flat RGBA buffer of the given size, calling `paint(x, y)` for
 * each pixel to get its [r, g, b] color (alpha is fixed at 255). */
function buildBuffer(width: number, height: number, paint: (x: number, y: number) => [number, number, number]): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = paint(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

describe('sampleRegionBrightness', () => {
  it('averages luma over the requested sub-rectangle', () => {
    const buffer = buildBuffer(10, 10, () => [200, 200, 200]);
    const brightness = sampleRegionBrightness(buffer, 0, 1, 0, 1);
    expect(brightness).toBeCloseTo(200, 0);
  });

  it('only samples within the given normalized bounds', () => {
    // Left half black, right half white.
    const buffer = buildBuffer(10, 10, (x) => (x < 5 ? [0, 0, 0] : [255, 255, 255]));
    const leftBrightness = sampleRegionBrightness(buffer, 0, 0.5, 0, 1);
    const rightBrightness = sampleRegionBrightness(buffer, 0.5, 1, 0, 1);
    expect(leftBrightness).toBeLessThan(20);
    expect(rightBrightness).toBeGreaterThan(230);
  });
});

describe('classifyMouthOcclusion', () => {
  it('does not flag a high-contrast region (teeth/tongue/oral cavity detail)', () => {
    // A checkerboard pattern has high local contrast, like a real open mouth.
    const buffer = buildBuffer(20, 20, (x, y) => ((x + y) % 2 === 0 ? [10, 10, 10] : [240, 240, 240]));
    const result = classifyMouthOcclusion(buffer, { xMin: 0, xMax: 1, yMin: 0, yMax: 1 });
    expect(result.occluded).toBe(false);
    expect(result.stdDev).toBeGreaterThan(18);
  });

  it('flags a suspiciously uniform region as possibly occluded', () => {
    const buffer = buildBuffer(20, 20, () => [140, 140, 140]);
    const result = classifyMouthOcclusion(buffer, { xMin: 0, xMax: 1, yMin: 0, yMax: 1 });
    expect(result.occluded).toBe(true);
    expect(result.stdDev).toBeLessThan(18);
  });

  it('respects a custom minStdDev threshold', () => {
    const buffer = buildBuffer(20, 20, (x) => (x < 10 ? [130, 130, 130] : [150, 150, 150]));
    expect(classifyMouthOcclusion(buffer, { xMin: 0, xMax: 1, yMin: 0, yMax: 1 }, 5).occluded).toBe(false);
    expect(classifyMouthOcclusion(buffer, { xMin: 0, xMax: 1, yMin: 0, yMax: 1 }, 50).occluded).toBe(true);
  });
});

// Target box at the left third, reference box at the right third — distinct,
// non-overlapping regions of the same buffer so tests can give each a
// different color/uniformity independently.
const TARGET_BOX = { xMin: 0, xMax: 0.3, yMin: 0, yMax: 1 };
const REFERENCE_BOX = { xMin: 0.7, xMax: 1, yMin: 0, yMax: 1 };

describe('classifyRegionOcclusionAdaptive', () => {
  it('flags occluded when the region is uniform AND matches the reference skin patch', () => {
    const buffer = buildBuffer(30, 10, (x) => (x < 9 ? [150, 150, 150] : [152, 152, 152]));
    const result = classifyRegionOcclusionAdaptive(buffer, TARGET_BOX, REFERENCE_BOX);
    expect(result.occluded).toBe(true);
    expect(result.lumaDiff).toBeLessThan(20);
  });

  it('does not flag a uniform region whose brightness clearly differs from the reference', () => {
    // Target is uniform but much darker than the reference skin patch —
    // e.g. an eye/mouth that happens to read low-contrast, not skin.
    const buffer = buildBuffer(30, 10, (x) => (x < 9 ? [40, 40, 40] : [180, 180, 180]));
    const result = classifyRegionOcclusionAdaptive(buffer, TARGET_BOX, REFERENCE_BOX);
    expect(result.occluded).toBe(false);
    expect(result.lumaDiff).toBeGreaterThan(20);
  });

  it('does not flag a high-contrast region even if its average brightness matches the reference', () => {
    const buffer = buildBuffer(30, 10, (x, y) => {
      if (x < 9) return (x + y) % 2 === 0 ? [50, 50, 50] : [250, 250, 250];
      return [150, 150, 150];
    });
    const result = classifyRegionOcclusionAdaptive(buffer, TARGET_BOX, REFERENCE_BOX);
    expect(result.occluded).toBe(false);
    expect(result.stdDev).toBeGreaterThan(18);
  });

  it('respects custom minStdDev/maxLumaDiff options', () => {
    const buffer = buildBuffer(30, 10, (x) => (x < 9 ? [140, 140, 140] : [170, 170, 170]));
    expect(classifyRegionOcclusionAdaptive(buffer, TARGET_BOX, REFERENCE_BOX).occluded).toBe(false);
    expect(classifyRegionOcclusionAdaptive(buffer, TARGET_BOX, REFERENCE_BOX, { maxLumaDiff: 40 }).occluded).toBe(true);
  });

  it('fails safe (occluded) for an empty target box', () => {
    const buffer = buildBuffer(30, 10, () => [150, 150, 150]);
    const result = classifyRegionOcclusionAdaptive(buffer, { xMin: 2, xMax: 1, yMin: 0, yMax: 1 }, REFERENCE_BOX);
    expect(result.occluded).toBe(true);
  });
});
