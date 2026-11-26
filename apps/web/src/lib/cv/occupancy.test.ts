import {
  classifyOccupancy,
  PERSON_CONFIDENCE_THRESHOLD,
  SECONDARY_SIZE_RATIO,
  torsoSize,
} from './occupancy';
import { POSE_LM, type Landmark } from './pose-visibility';

/**
 * Builds a 33-point landmark array for one person, with a torso of the given
 * on-screen size. `size` is the shoulder width AND the shoulder-to-hip height,
 * so the resulting torso diagonal is `size * Math.SQRT2`.
 */
function person(options: { size: number; visibility?: number; centerX?: number }): Landmark[] {
  const { size, visibility = 0.9, centerX = 0.5 } = options;
  const landmarks: Landmark[] = Array.from({ length: 33 }, () => ({ x: centerX, y: 0.5, visibility }));

  const half = size / 2;
  landmarks[POSE_LM.leftShoulder] = { x: centerX - half, y: 0.3, visibility };
  landmarks[POSE_LM.rightShoulder] = { x: centerX + half, y: 0.3, visibility };
  landmarks[POSE_LM.leftHip] = { x: centerX - half, y: 0.3 + size, visibility };
  landmarks[POSE_LM.rightHip] = { x: centerX + half, y: 0.3 + size, visibility };

  return landmarks;
}

describe('torsoSize', () => {
  it('measures the torso diagonal in normalized units', () => {
    // 0.2 wide × 0.2 tall → diagonal of 0.2 * sqrt(2).
    expect(torsoSize(person({ size: 0.2 }))).toBeCloseTo(0.2 * Math.SQRT2, 5);
  });

  it('grows as the person moves closer to the camera', () => {
    expect(torsoSize(person({ size: 0.4 }))).toBeGreaterThan(torsoSize(person({ size: 0.15 })));
  });

  it('returns 0 for missing landmarks', () => {
    expect(torsoSize(undefined)).toBe(0);
    expect(torsoSize([])).toBe(0);
  });
});

describe('classifyOccupancy', () => {
  it('reports an empty frame when the detector returns nothing', () => {
    expect(classifyOccupancy(undefined).personCount).toBe(0);
    expect(classifyOccupancy([]).personCount).toBe(0);
    expect(classifyOccupancy([]).crowded).toBe(false);
    expect(classifyOccupancy([]).primary).toBeUndefined();
  });

  it('accepts a single person and does not flag them as crowded', () => {
    const result = classifyOccupancy([person({ size: 0.3 })]);
    expect(result.personCount).toBe(1);
    expect(result.crowded).toBe(false);
    expect(result.primaryIndex).toBe(0);
    expect(result.primary).toBeDefined();
  });

  it('flags two comparably-sized people as crowded', () => {
    const result = classifyOccupancy([person({ size: 0.3, centerX: 0.3 }), person({ size: 0.28, centerX: 0.7 })]);
    expect(result.personCount).toBe(2);
    expect(result.crowded).toBe(true);
  });

  it('picks the LARGEST person as the subject regardless of detector order', () => {
    // The real subject is nearest the camera, so biggest on screen — even when
    // the detector happens to list the bystander first.
    const bystanderFirst = [person({ size: 0.15, centerX: 0.2 }), person({ size: 0.4, centerX: 0.6 })];
    const result = classifyOccupancy(bystanderFirst);
    expect(result.primaryIndex).toBe(1);
    expect(torsoSize(result.primary)).toBeCloseTo(0.4 * Math.SQRT2, 5);
  });

  it('ignores a distant background person too small to be a tracking risk', () => {
    // A person far behind the subject is much smaller in frame — warning about
    // them would nag users about housemates passing a doorway.
    const tiny = SECONDARY_SIZE_RATIO * 0.4 * 0.5; // well under the ratio
    const result = classifyOccupancy([person({ size: 0.4 }), person({ size: tiny, centerX: 0.9 })]);
    expect(result.crowded).toBe(false);
    expect(result.personCount).toBe(1);
  });

  it('flags a nearby second person who is somewhat smaller but still comparable', () => {
    // Just above the ratio → counts. Guards the boundary from being too lax.
    const secondary = 0.4 * (SECONDARY_SIZE_RATIO + 0.1);
    const result = classifyOccupancy([person({ size: 0.4 }), person({ size: secondary, centerX: 0.85 })]);
    expect(result.crowded).toBe(true);
    expect(result.personCount).toBe(2);
  });

  it('discards low-confidence detections rather than counting them as people', () => {
    // A reflection or a poster produces a low-confidence pose; it must not
    // block the user from taking the test.
    const ghost = person({ size: 0.3, visibility: PERSON_CONFIDENCE_THRESHOLD - 0.1, centerX: 0.8 });
    const result = classifyOccupancy([person({ size: 0.3 }), ghost]);
    expect(result.crowded).toBe(false);
    expect(result.personCount).toBe(1);
  });

  it('returns an empty frame when every detection is low-confidence', () => {
    const ghost = person({ size: 0.3, visibility: 0.1 });
    expect(classifyOccupancy([ghost]).personCount).toBe(0);
    expect(classifyOccupancy([ghost]).primary).toBeUndefined();
  });

  // The live detector is capped at MAX_DETECTED_POSES (3) for speed. The
  // classifier is length-agnostic and must stay correct at or beyond that cap.
  it('counts three people in frame', () => {
    const result = classifyOccupancy([
      person({ size: 0.3, centerX: 0.2 }),
      person({ size: 0.3, centerX: 0.5 }),
      person({ size: 0.3, centerX: 0.8 }),
    ]);
    expect(result.personCount).toBe(3);
    expect(result.crowded).toBe(true);
  });

  it('keeps the same subject as the user squats (torso span is depth-stable)', () => {
    // Squatting shortens the body's bounding box a lot but barely changes the
    // shoulder-to-hip span, so the subject pick must not flip to a bystander
    // partway through a rep.
    const standing = classifyOccupancy([person({ size: 0.4 }), person({ size: 0.25, centerX: 0.85 })]);
    const squatting = classifyOccupancy([person({ size: 0.38 }), person({ size: 0.25, centerX: 0.85 })]);
    expect(standing.primaryIndex).toBe(0);
    expect(squatting.primaryIndex).toBe(0);
  });
});
