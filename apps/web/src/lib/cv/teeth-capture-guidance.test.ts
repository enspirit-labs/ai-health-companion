import { FACE_LM, type FaceLandmark } from './face-framing';
import type { PixelFrame } from './frame-quality';
import { evaluateTeethCaptureChecks, evaluateTeethCaptureFrame, type TeethCaptureFrameInput } from './teeth-capture-guidance';

const FRAME_SIZE = 20;

/** Every landmark this test cares about, as an (dx, dy) offset from a face
 * "center" at scale 1 — e.g. the left/right face-width markers (arbitrary
 * unused indices 0/1) sit 0.2 either side of center. `makeLandmarks` scales
 * and re-centers all of them together, since faceBoundingBox now scans every
 * passed landmark: moving just one or two points (as a curated-subset model
 * would allow) no longer changes the overall box once other landmarks —
 * e.g. the mouth corners — span wider than the moved points do. */
const BASE_OFFSETS: Record<number, { dx: number; dy: number }> = {
  0: { dx: -0.2, dy: 0 }, // left face-width edge
  1: { dx: 0.2, dy: 0 }, // right face-width edge
  [FACE_LM.faceHeightRef[0]]: { dx: 0, dy: -0.2 }, // forehead
  [FACE_LM.faceHeightRef[1]]: { dx: 0, dy: 0.2 }, // chin
  [FACE_LM.rightEye[0]]: { dx: -0.15, dy: -0.1 },
  [FACE_LM.leftEye[0]]: { dx: 0.15, dy: -0.1 },
  [FACE_LM.mouth[0]]: { dx: -0.08, dy: 0.13 }, // left corner
  [FACE_LM.mouth[1]]: { dx: 0.08, dy: 0.13 }, // right corner
  [FACE_LM.mouth[2]]: { dx: 0, dy: 0.08 }, // upper inner lip
  [FACE_LM.mouth[3]]: { dx: 0, dy: 0.16 }, // lower inner lip — well open
};

function makeLandmarks(
  options: {
    center?: { x: number; y: number };
    scale?: number;
    overrides?: Record<number, Partial<FaceLandmark>>;
  } = {},
): FaceLandmark[] {
  const center = options.center ?? { x: 0.5, y: 0.5 };
  const scale = options.scale ?? 1;

  const landmarks: FaceLandmark[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  for (const [index, { dx, dy }] of Object.entries(BASE_OFFSETS)) {
    landmarks[Number(index)] = { x: center.x + dx * scale, y: center.y + dy * scale };
  }
  for (const [index, value] of Object.entries(options.overrides ?? {})) {
    landmarks[Number(index)] = { ...landmarks[Number(index)], ...value };
  }
  return landmarks;
}

function makePixelFrame(pixel: (x: number, y: number) => number): PixelFrame {
  const data = new Uint8ClampedArray(FRAME_SIZE * FRAME_SIZE * 4);
  for (let y = 0; y < FRAME_SIZE; y += 1) {
    for (let x = 0; x < FRAME_SIZE; x += 1) {
      const value = pixel(x, y);
      const offset = (y * FRAME_SIZE + x) * 4;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return { data, width: FRAME_SIZE, height: FRAME_SIZE };
}

const wellLitSharpFrame = makePixelFrame((x, y) => ((x + y) % 2 === 0 ? 40 : 210));

function baseInput(overrides: Partial<TeethCaptureFrameInput> = {}): TeethCaptureFrameInput {
  return {
    faceCount: 1,
    landmarks: makeLandmarks(),
    videoWidth: 1280,
    videoHeight: 720,
    pixelFrame: wellLitSharpFrame,
    movementDelta: 0,
    ...overrides,
  };
}

describe('evaluateTeethCaptureFrame', () => {
  it('allows capture when every check passes', () => {
    const result = evaluateTeethCaptureFrame(baseInput());
    expect(result.canCapture).toBe(true);
    expect(result.instruction).toBe('Perfect! Hold still while we capture your image.');
  });

  it('blocks on a below-720p feed', () => {
    const result = evaluateTeethCaptureFrame(baseInput({ videoWidth: 640, videoHeight: 480 }));
    expect(result.canCapture).toBe(false);
    expect(result.instruction).toMatch(/resolution/i);
  });

  it('blocks when more than one face is detected', () => {
    const result = evaluateTeethCaptureFrame(baseInput({ faceCount: 2 }));
    expect(result.canCapture).toBe(false);
    expect(result.instruction).toMatch(/one person/i);
  });

  it('blocks when no face is detected', () => {
    const result = evaluateTeethCaptureFrame(baseInput({ faceCount: 0, landmarks: undefined }));
    expect(result.canCapture).toBe(false);
    expect(result.instruction).toMatch(/center your face/i);
  });

  it('blocks an off-center face', () => {
    const landmarks = makeLandmarks({ center: { x: 0.85, y: 0.5 } });
    const result = evaluateTeethCaptureFrame(baseInput({ landmarks }));
    expect(result.canCapture).toBe(false);
    expect(result.instruction).toMatch(/center your face/i);
  });

  it('blocks a tilted head', () => {
    const landmarks = makeLandmarks({
      overrides: {
        [FACE_LM.rightEye[0]]: { x: 0.35, y: 0.3 },
        [FACE_LM.leftEye[0]]: { x: 0.65, y: 0.5 },
      },
    });
    const result = evaluateTeethCaptureFrame(baseInput({ landmarks }));
    expect(result.canCapture).toBe(false);
    expect(result.instruction).toMatch(/straighten/i);
  });

  it('blocks a face that is too far away (too small)', () => {
    const landmarks = makeLandmarks({ scale: 0.1 });
    const result = evaluateTeethCaptureFrame(baseInput({ landmarks }));
    expect(result.canCapture).toBe(false);
    expect(result.instruction).toMatch(/closer/i);
  });

  it('blocks a face that is too close (too large)', () => {
    const landmarks = makeLandmarks({ scale: 2.5 });
    const result = evaluateTeethCaptureFrame(baseInput({ landmarks }));
    expect(result.canCapture).toBe(false);
    expect(result.instruction).toMatch(/move back/i);
  });

  it('blocks a mouth that is not open wide enough', () => {
    const landmarks = makeLandmarks({
      overrides: {
        [FACE_LM.mouth[2]]: { x: 0.5, y: 0.61 },
        [FACE_LM.mouth[3]]: { x: 0.5, y: 0.615 },
      },
    });
    const result = evaluateTeethCaptureFrame(baseInput({ landmarks }));
    expect(result.canCapture).toBe(false);
    expect(result.instruction).toMatch(/open your mouth/i);
  });

  it('blocks a too-dark frame', () => {
    const result = evaluateTeethCaptureFrame(baseInput({ pixelFrame: makePixelFrame(() => 5) }));
    expect(result.canCapture).toBe(false);
    expect(result.instruction).toMatch(/lighting/i);
  });

  it('blocks a too-bright / glare frame', () => {
    const result = evaluateTeethCaptureFrame(baseInput({ pixelFrame: makePixelFrame(() => 250) }));
    expect(result.canCapture).toBe(false);
    expect(result.instruction).toMatch(/lighting/i);
  });

  it('blocks a blurry frame', () => {
    const result = evaluateTeethCaptureFrame(baseInput({ pixelFrame: makePixelFrame(() => 128) }));
    expect(result.canCapture).toBe(false);
    expect(result.instruction).toMatch(/hold still/i);
  });

  it('blocks excessive movement', () => {
    const result = evaluateTeethCaptureFrame(baseInput({ movementDelta: 0.05 }));
    expect(result.canCapture).toBe(false);
    expect(result.instruction).toMatch(/hold still/i);
  });
});

describe('evaluateTeethCaptureChecks', () => {
  it('reports every check true when the frame passes evaluateTeethCaptureFrame', () => {
    const checks = evaluateTeethCaptureChecks(baseInput());
    expect(checks).toEqual({ face: true, mouth: true, distance: true, lighting: true, stable: true });
  });

  it('flags only face for an off-center face, leaving mouth/distance/lighting/stable true', () => {
    const landmarks = makeLandmarks({ center: { x: 0.85, y: 0.5 } });
    const checks = evaluateTeethCaptureChecks(baseInput({ landmarks }));
    expect(checks.face).toBe(false);
    expect(checks.mouth).toBe(true);
    expect(checks.distance).toBe(true);
    expect(checks.lighting).toBe(true);
    expect(checks.stable).toBe(true);
  });

  it('flags only mouth when the mouth is not open wide enough', () => {
    const landmarks = makeLandmarks({
      overrides: {
        [FACE_LM.mouth[2]]: { x: 0.5, y: 0.61 },
        [FACE_LM.mouth[3]]: { x: 0.5, y: 0.615 },
      },
    });
    const checks = evaluateTeethCaptureChecks(baseInput({ landmarks }));
    expect(checks).toEqual({ face: true, mouth: false, distance: true, lighting: true, stable: true });
  });

  it('flags only distance for a face that is too close', () => {
    const landmarks = makeLandmarks({ scale: 2.5 });
    const checks = evaluateTeethCaptureChecks(baseInput({ landmarks }));
    expect(checks).toEqual({ face: true, mouth: true, distance: false, lighting: true, stable: true });
  });

  it('flags lighting (and stable, since a flat-color test frame also reads as textureless/blurry) for a too-dark frame', () => {
    const checks = evaluateTeethCaptureChecks(baseInput({ pixelFrame: makePixelFrame(() => 5) }));
    expect(checks).toEqual({ face: true, mouth: true, distance: true, lighting: false, stable: false });
  });

  it('flags only stable for excessive movement', () => {
    const checks = evaluateTeethCaptureChecks(baseInput({ movementDelta: 0.05 }));
    expect(checks).toEqual({ face: true, mouth: true, distance: true, lighting: true, stable: false });
  });

  it('flags only stable for a blurry frame', () => {
    const checks = evaluateTeethCaptureChecks(baseInput({ pixelFrame: makePixelFrame(() => 128) }));
    expect(checks).toEqual({ face: true, mouth: true, distance: true, lighting: true, stable: false });
  });

  it('flags face when no one is in frame', () => {
    const checks = evaluateTeethCaptureChecks(baseInput({ faceCount: 0, landmarks: undefined }));
    expect(checks.face).toBe(false);
  });
});
