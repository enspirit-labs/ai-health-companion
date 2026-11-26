import { analyzeLighting, LIGHTING_THRESHOLDS } from './lighting';

/** RGBA buffer of `pixels` identical grey pixels (r=g=b=value keeps Rec.601
 * luma equal to `value`). */
function solid(value: number, pixels = 64): Uint8ClampedArray {
  const data = new Uint8ClampedArray(pixels * 4);
  for (let i = 0; i < pixels; i += 1) {
    data[i * 4] = value;
    data[i * 4 + 1] = value;
    data[i * 4 + 2] = value;
    data[i * 4 + 3] = 255;
  }
  return data;
}

/** Half the pixels at `low`, half at `high` — a backlit / uneven frame. */
function split(low: number, high: number, pixels = 64): Uint8ClampedArray {
  const data = new Uint8ClampedArray(pixels * 4);
  for (let i = 0; i < pixels; i += 1) {
    const value = i < pixels / 2 ? low : high;
    data[i * 4] = value;
    data[i * 4 + 1] = value;
    data[i * 4 + 2] = value;
    data[i * 4 + 3] = 255;
  }
  return data;
}

describe('analyzeLighting', () => {
  it('accepts a well-lit, even frame', () => {
    const result = analyzeLighting(solid(140), LIGHTING_THRESHOLDS, 1);
    expect(result.ok).toBe(true);
    expect(result.hint).toBeNull();
    expect(result.brightness).toBeCloseTo(140, 0);
  });

  it('flags a dark frame and tells the user to move somewhere brighter', () => {
    const result = analyzeLighting(solid(20), LIGHTING_THRESHOLDS, 1);
    expect(result.tooDark).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.hint).toMatch(/bright/i);
  });

  it('flags an over-bright frame', () => {
    const result = analyzeLighting(solid(245), LIGHTING_THRESHOLDS, 1);
    expect(result.tooBright).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.hint).toMatch(/glare|light|sun/i);
  });

  it('labels a very high-contrast frame `uneven` but does NOT block on it', () => {
    // Unevenness is diagnostic only: a big luma spread must not fail `ok` or
    // produce a hint, because a person in a normal room always reads as
    // high-contrast (this was the "Uneven lighting…" false-positive nag).
    const result = analyzeLighting(split(15, 250), LIGHTING_THRESHOLDS, 1);
    expect(result.tooDark).toBe(false);
    expect(result.uneven).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.hint).toBeNull();
  });

  it('does NOT flag uneven for a couple of outlier pixels (percentile, not max-min)', () => {
    // Mostly even mid-grey, with one near-black and one near-white outlier.
    const data = solid(140, 64);
    data[0] = data[1] = data[2] = 0; // one black pixel
    data[4] = data[5] = data[6] = 255; // one white pixel
    const result = analyzeLighting(data, LIGHTING_THRESHOLDS, 1);
    expect(result.uneven).toBe(false);
    expect(result.ok).toBe(true);
  });

  it('prefers the "dark" verdict over "uneven" for a mostly-dark frame', () => {
    const result = analyzeLighting(split(5, 60), LIGHTING_THRESHOLDS, 1);
    expect(result.tooDark).toBe(true);
    expect(result.uneven).toBe(false);
  });

  it('treats an empty / missing buffer as too dark without throwing', () => {
    expect(() => analyzeLighting(undefined)).not.toThrow();
    expect(analyzeLighting(undefined).tooDark).toBe(true);
    expect(analyzeLighting(new Uint8ClampedArray(0)).tooDark).toBe(true);
  });
});
