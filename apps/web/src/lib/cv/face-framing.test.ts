import {
  classifyEyeSizeSymmetry,
  classifyFaceFraming,
  classifyMouthOpenness,
  eyeBoundingBox,
  eyeSizeSymmetryRatio,
  FACE_LM,
  faceBoundingBox,
  faceWidthRatio,
  foreheadReferenceBox,
  headTiltDegrees,
  jawBoundingBox,
  mouthBoundingBox,
  mouthOpenRatio,
  noseVerticalOffsetRatio,
  noseYawOffsetRatio,
  type FaceLandmark,
} from './face-framing';

/** Builds a 478-entry landmark array with every point centered in-frame and
 * the face spanning a reasonable 50% of frame width, so individual tests
 * only need to override what they care about. */
function wellFramedFace(overrides: Record<number, FaceLandmark> = {}): FaceLandmark[] {
  const landmarks: FaceLandmark[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  // Spread two anchor points to establish a ~50%-of-frame-width face.
  landmarks[0] = { x: 0.25, y: 0.5 };
  landmarks[1] = { x: 0.75, y: 0.5 };
  for (const [index, value] of Object.entries(overrides)) {
    landmarks[Number(index)] = value;
  }
  return landmarks;
}

describe('classifyFaceFraming', () => {
  it('reports everything ok for a well-framed face', () => {
    const result = classifyFaceFraming(wellFramedFace());
    expect(result).toEqual({
      eyes: true,
      eyebrows: true,
      mouth: true,
      jaw: true,
      nose: true,
      notClipped: true,
      faceSizeOk: true,
      missing: [],
    });
  });

  it('flags eyes when a right-eye point is clipped past the margin', () => {
    const result = classifyFaceFraming(
      wellFramedFace({
        [FACE_LM.rightEye[0]]: { x: 0.01, y: 0.5 },
      }),
    );
    expect(result.eyes).toBe(false);
    expect(result.missing).toContain('eyes');
  });

  it('flags mouth when a mouth point sits within the 3% margin', () => {
    const result = classifyFaceFraming(
      wellFramedFace({
        [FACE_LM.mouth[0]]: { x: 0.5, y: 0.985 },
      }),
    );
    expect(result.mouth).toBe(false);
  });

  it('flags nose when the nose tip is clipped past the margin', () => {
    const result = classifyFaceFraming(
      wellFramedFace({
        [FACE_LM.nose[0]]: { x: 0.99, y: 0.5 },
      }),
    );
    expect(result.nose).toBe(false);
    expect(result.missing).toContain('nose');
  });

  it('flags notClipped when any landmark (not just a named region) sits past the margin', () => {
    const result = classifyFaceFraming(
      wellFramedFace({
        // An arbitrary point outside eyes/eyebrows/mouth/jaw/nose, e.g. a
        // forehead/hairline point — should still trip the whole-face check.
        10: { x: 0.5, y: 0.99 },
      }),
    );
    expect(result.notClipped).toBe(false);
    expect(result.eyes).toBe(true);
    expect(result.mouth).toBe(true);
  });

  it('passes a point exactly on the margin boundary (inclusive)', () => {
    const result = classifyFaceFraming(
      wellFramedFace({
        [FACE_LM.jaw[0]]: { x: 0.03, y: 0.5 },
      }),
      { margin: 0.03 },
    );
    expect(result.jaw).toBe(true);
  });

  it('flags faceSizeOk when the face is too small (too far away)', () => {
    const result = classifyFaceFraming(
      wellFramedFace({
        0: { x: 0.45, y: 0.5 },
        1: { x: 0.55, y: 0.5 },
      }),
    );
    expect(result.faceSizeOk).toBe(false);
    expect(result.missing).toContain('faceSize');
  });

  it('flags faceSizeOk when the face is too large (too close)', () => {
    const result = classifyFaceFraming(
      wellFramedFace({
        0: { x: 0.05, y: 0.5 },
        1: { x: 0.95, y: 0.5 },
      }),
    );
    expect(result.faceSizeOk).toBe(false);
  });

  it('respects custom margin/width-ratio options', () => {
    const face = wellFramedFace();
    expect(classifyFaceFraming(face, { minWidthRatio: 0.6 }).faceSizeOk).toBe(false);
    expect(classifyFaceFraming(face, { minWidthRatio: 0.4 }).faceSizeOk).toBe(true);
  });

  it('treats missing/undefined landmarks as not in frame without throwing', () => {
    expect(() => classifyFaceFraming(undefined)).not.toThrow();
    expect(classifyFaceFraming(undefined)).toEqual({
      eyes: false,
      eyebrows: false,
      mouth: false,
      jaw: false,
      nose: false,
      notClipped: false,
      faceSizeOk: false,
      missing: ['eyes', 'eyebrows', 'mouth', 'jaw', 'nose', 'notClipped', 'faceSize'],
    });
    expect(() => classifyFaceFraming([])).not.toThrow();
  });
});

describe('faceBoundingBox / faceWidthRatio', () => {
  it('computes the bounding box and width ratio from all landmarks', () => {
    const box = faceBoundingBox(wellFramedFace());
    expect(box).toEqual({ minX: 0.25, maxX: 0.75, minY: 0.5, maxY: 0.5 });
    expect(faceWidthRatio(wellFramedFace())).toBeCloseTo(0.5, 5);
  });

  it('returns null for missing/empty landmarks', () => {
    expect(faceBoundingBox(undefined)).toBeNull();
    expect(faceBoundingBox([])).toBeNull();
    expect(faceWidthRatio(undefined)).toBeNull();
  });
});

function faceWithEyes(rightSpan: number, leftSpan: number): FaceLandmark[] {
  const landmarks = wellFramedFace();
  landmarks[FACE_LM.rightEye[0]] = { x: 0.5 - rightSpan, y: 0.4 };
  landmarks[FACE_LM.rightEye[1]] = { x: 0.5, y: 0.4 };
  landmarks[FACE_LM.leftEye[0]] = { x: 0.5 + leftSpan, y: 0.4 };
  landmarks[FACE_LM.leftEye[1]] = { x: 0.5, y: 0.4 };
  return landmarks;
}

describe('eyeSizeSymmetryRatio / classifyEyeSizeSymmetry', () => {
  it('reports a ratio of 1 and passes for equally sized eyes', () => {
    const landmarks = faceWithEyes(0.1, 0.1);
    expect(eyeSizeSymmetryRatio(landmarks)).toBeCloseTo(1, 5);
    expect(classifyEyeSizeSymmetry(landmarks)).toBe(true);
  });

  it('fails when one eye is much smaller than the other (strong head turn)', () => {
    const landmarks = faceWithEyes(0.1, 0.04);
    expect(classifyEyeSizeSymmetry(landmarks)).toBe(false);
  });

  it('treats missing landmarks as not-ok without throwing', () => {
    expect(() => classifyEyeSizeSymmetry(undefined)).not.toThrow();
    expect(classifyEyeSizeSymmetry(undefined)).toBe(false);
    expect(eyeSizeSymmetryRatio([])).toBeNull();
  });
});

function faceWithMouthGap(gap: number): FaceLandmark[] {
  const landmarks = wellFramedFace();
  landmarks[FACE_LM.faceHeightRef[0]] = { x: 0.5, y: 0.1 };
  landmarks[FACE_LM.faceHeightRef[1]] = { x: 0.5, y: 0.9 };
  landmarks[FACE_LM.mouth[2]] = { x: 0.5, y: 0.45 };
  landmarks[FACE_LM.mouth[3]] = { x: 0.5, y: 0.45 + gap };
  return landmarks;
}

describe('mouthOpenRatio / classifyMouthOpenness', () => {
  it('reports a small ratio for a closed mouth', () => {
    const landmarks = faceWithMouthGap(0.002);
    const ratio = mouthOpenRatio(landmarks);
    expect(ratio).toBeCloseTo(0.0025, 4);
    expect(classifyMouthOpenness(landmarks, 0.045)).toBe(false);
  });

  it('reports a large ratio for an open mouth and passes a reasonable threshold', () => {
    const landmarks = faceWithMouthGap(0.05);
    const ratio = mouthOpenRatio(landmarks);
    expect(ratio).toBeCloseTo(0.0625, 4);
    expect(classifyMouthOpenness(landmarks, 0.045)).toBe(true);
  });

  it('treats missing landmarks as not-open without throwing', () => {
    expect(() => classifyMouthOpenness(undefined, 0.045)).not.toThrow();
    expect(classifyMouthOpenness(undefined, 0.045)).toBe(false);
    expect(mouthOpenRatio([])).toBeNull();
  });
});

describe('mouthBoundingBox', () => {
  it('spans the mouth corners and inner lip points', () => {
    const landmarks = wellFramedFace({
      [FACE_LM.mouth[0]]: { x: 0.4, y: 0.6 }, // left corner
      [FACE_LM.mouth[1]]: { x: 0.6, y: 0.6 }, // right corner
      [FACE_LM.mouth[2]]: { x: 0.5, y: 0.58 }, // upper lip — topmost
      [FACE_LM.mouth[3]]: { x: 0.5, y: 0.63 }, // lower lip — bottommost
    });

    const box = mouthBoundingBox(landmarks);

    expect(box).not.toBeNull();
    expect(box?.minX).toBeCloseTo(0.4);
    expect(box?.maxX).toBeCloseTo(0.6);
    expect(box?.minY).toBeCloseTo(0.58);
    expect(box?.maxY).toBeCloseTo(0.63);
  });

  it('returns null for missing/empty landmarks', () => {
    expect(mouthBoundingBox(undefined)).toBeNull();
    expect(mouthBoundingBox([])).toBeNull();
  });
});

describe('headTiltDegrees', () => {
  it('is 0 when the eyes’ outer corners are level', () => {
    const landmarks = wellFramedFace({
      [FACE_LM.rightEye[0]]: { x: 0.35, y: 0.4 },
      [FACE_LM.leftEye[0]]: { x: 0.65, y: 0.4 },
    });

    expect(headTiltDegrees(landmarks)).toBeCloseTo(0);
  });

  it('is nonzero and flips sign depending on which eye sits lower', () => {
    const tiltedOneWay = wellFramedFace({
      [FACE_LM.rightEye[0]]: { x: 0.35, y: 0.35 },
      [FACE_LM.leftEye[0]]: { x: 0.65, y: 0.45 },
    });
    const tiltedOtherWay = wellFramedFace({
      [FACE_LM.rightEye[0]]: { x: 0.35, y: 0.45 },
      [FACE_LM.leftEye[0]]: { x: 0.65, y: 0.35 },
    });

    const a = headTiltDegrees(tiltedOneWay);
    const b = headTiltDegrees(tiltedOtherWay);
    expect(a).not.toBeCloseTo(0);
    expect(Math.sign(a)).toBe(-Math.sign(b));
  });

  it('returns 0 when the required landmarks are missing', () => {
    expect(headTiltDegrees([])).toBe(0);
    expect(headTiltDegrees(undefined)).toBe(0);
  });
});

describe('eyeBoundingBox', () => {
  it('spans both eyes', () => {
    const landmarks = wellFramedFace({
      [FACE_LM.rightEye[0]]: { x: 0.35, y: 0.4 },
      [FACE_LM.leftEye[0]]: { x: 0.65, y: 0.4 },
      [FACE_LM.rightEye[2]]: { x: 0.4, y: 0.38 },
      [FACE_LM.leftEye[2]]: { x: 0.6, y: 0.38 },
    });

    const box = eyeBoundingBox(landmarks);

    expect(box).not.toBeNull();
    expect(box?.minX).toBeCloseTo(0.35);
    expect(box?.maxX).toBeCloseTo(0.65);
  });

  it('returns null for missing/empty landmarks', () => {
    expect(eyeBoundingBox(undefined)).toBeNull();
    expect(eyeBoundingBox([])).toBeNull();
  });
});

function faceWithNose(noseX: number): FaceLandmark[] {
  return wellFramedFace({
    [FACE_LM.nose[0]]: { x: noseX, y: 0.5 },
    [FACE_LM.rightEye[0]]: { x: 0.35, y: 0.4 },
    [FACE_LM.leftEye[0]]: { x: 0.65, y: 0.4 },
  });
}

describe('noseYawOffsetRatio', () => {
  it('is ~0 for a centered nose', () => {
    expect(noseYawOffsetRatio(faceWithNose(0.5))).toBeCloseTo(0, 5);
  });

  it('is positive when the nose shifts toward the leftEye side (turned toward the subject’s own left)', () => {
    expect(noseYawOffsetRatio(faceWithNose(0.6))).toBeGreaterThan(0);
  });

  it('is negative when the nose shifts toward the rightEye side (turned toward the subject’s own right)', () => {
    expect(noseYawOffsetRatio(faceWithNose(0.4))).toBeLessThan(0);
  });

  it('returns null when required landmarks are missing', () => {
    expect(noseYawOffsetRatio(undefined)).toBeNull();
    expect(noseYawOffsetRatio([])).toBeNull();
  });
});

function faceWithNoseY(noseY: number): FaceLandmark[] {
  return wellFramedFace({
    [FACE_LM.nose[0]]: { x: 0.5, y: noseY },
    [FACE_LM.rightEye[2]]: { x: 0.4, y: 0.4 },
    [FACE_LM.leftEye[2]]: { x: 0.6, y: 0.4 },
    [FACE_LM.mouth[2]]: { x: 0.5, y: 0.6 },
  });
}

describe('noseVerticalOffsetRatio', () => {
  it('is ~0 for a nose centered between eye level and the upper lip', () => {
    expect(noseVerticalOffsetRatio(faceWithNoseY(0.5))).toBeCloseTo(0, 5);
  });

  it('is negative when the nose shifts toward eye level (tilted up)', () => {
    expect(noseVerticalOffsetRatio(faceWithNoseY(0.42))).toBeLessThan(0);
  });

  it('is positive when the nose shifts toward/past the upper lip (tilted down)', () => {
    expect(noseVerticalOffsetRatio(faceWithNoseY(0.58))).toBeGreaterThan(0);
  });

  it('returns null when required landmarks are missing', () => {
    expect(noseVerticalOffsetRatio(undefined)).toBeNull();
    expect(noseVerticalOffsetRatio([])).toBeNull();
  });
});

describe('jawBoundingBox', () => {
  it('spans the jaw/chin points', () => {
    const landmarks = wellFramedFace({
      [FACE_LM.jaw[0]]: { x: 0.5, y: 0.8 },
      [FACE_LM.jaw[1]]: { x: 0.3, y: 0.7 },
      [FACE_LM.jaw[2]]: { x: 0.7, y: 0.7 },
    });

    const box = jawBoundingBox(landmarks);

    expect(box).not.toBeNull();
    expect(box?.minX).toBeCloseTo(0.3);
    expect(box?.maxX).toBeCloseTo(0.7);
  });

  it('returns null for missing/empty landmarks', () => {
    expect(jawBoundingBox(undefined)).toBeNull();
    expect(jawBoundingBox([])).toBeNull();
  });
});

describe('foreheadReferenceBox', () => {
  it('centers between the hairline anchor and the eyebrows', () => {
    const browOverrides: Record<number, FaceLandmark> = {};
    for (const index of [...FACE_LM.leftEyebrow, ...FACE_LM.rightEyebrow]) {
      browOverrides[index] = { x: 0.5, y: 0.3 };
    }
    const landmarks = wellFramedFace({
      [FACE_LM.faceHeightRef[0]]: { x: 0.5, y: 0.1 },
      ...browOverrides,
    });

    const box = foreheadReferenceBox(landmarks);

    expect(box).not.toBeNull();
    // Midpoint between y=0.1 (hairline) and y=0.3 (brows) is y=0.2.
    expect((box!.minY + box!.maxY) / 2).toBeCloseTo(0.2, 5);
  });

  it('returns null for missing/empty landmarks', () => {
    expect(foreheadReferenceBox(undefined)).toBeNull();
    expect(foreheadReferenceBox([])).toBeNull();
  });
});
