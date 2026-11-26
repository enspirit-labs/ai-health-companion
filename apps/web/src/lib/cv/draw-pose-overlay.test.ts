import { drawSkeleton, resetSkeletonSmoothing } from './draw-pose-overlay';
import { POSE_LM, type Landmark } from './pose-visibility';

/**
 * These tests target the overlay's keypoint SMOOTHING, which is what determines
 * whether the drawn skeleton keeps up with the user or drags behind them. The
 * filter is velocity-adaptive, so the two properties that matter are:
 *   - at rest it must suppress detector jitter (a steady overlay), and
 *   - while moving fast it must track closely (no visible lag).
 * A fixed-alpha filter cannot do both, so both directions are pinned here.
 *
 * Smoothing isn't exported directly, so it's observed through drawSkeleton via a
 * canvas stub that records where the joints were actually drawn.
 */

const W = 640;
const H = 480;

/** Records the centre of every joint dot drawn (the `arc` calls). */
function stubCtx() {
  const dots: Array<{ x: number; y: number }> = [];
  const ctx = {
    canvas: { width: W, height: H },
    save() {}, restore() {},
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
    stroke() {}, fill() {},
    arc(x: number, y: number) { dots.push({ x, y }); },
    globalAlpha: 1, strokeStyle: '', fillStyle: '', lineWidth: 1, lineCap: '', lineJoin: '',
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, dots };
}

/** A full-body pose with both hips at normalized `hipY`. */
function pose(hipY: number): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
  const set = (i: number, x: number, y: number) => {
    lm[i] = { x, y, visibility: 0.95 };
  };
  set(POSE_LM.leftShoulder, 0.4, 0.3);
  set(POSE_LM.rightShoulder, 0.6, 0.3);
  set(POSE_LM.leftHip, 0.43, hipY);
  set(POSE_LM.rightHip, 0.57, hipY);
  set(POSE_LM.leftKnee, 0.43, hipY + 0.15);
  set(POSE_LM.rightKnee, 0.57, hipY + 0.15);
  set(POSE_LM.leftAnkle, 0.43, hipY + 0.3);
  set(POSE_LM.rightAnkle, 0.57, hipY + 0.3);
  set(POSE_LM.leftElbow, 0.35, 0.45);
  set(POSE_LM.rightElbow, 0.65, 0.45);
  set(POSE_LM.leftWrist, 0.33, 0.6);
  set(POSE_LM.rightWrist, 0.67, 0.6);
  return lm;
}

/** Feeds a pose and returns the drawn left-hip Y back in normalized units. */
function drawAndReadHipY(hipY: number): number {
  const { ctx, dots } = stubCtx();
  drawSkeleton(ctx, pose(hipY), [], W, H);
  // Joint dots are drawn in JOINT_INDICES order; find the one nearest the
  // expected hip position rather than depending on that ordering.
  const target = hipY * H;
  const nearest = dots.reduce((best, d) => (Math.abs(d.y - target) < Math.abs(best.y - target) ? d : best));
  return nearest.y / H;
}

describe('drawSkeleton keypoint smoothing', () => {
  beforeEach(() => {
    resetSkeletonSmoothing();
  });

  it('draws the first frame exactly where the landmark is (no startup lag)', () => {
    // With no previous sample there is nothing to smooth toward, so the very
    // first frame must land on the true position rather than easing in from 0.
    expect(drawAndReadHipY(0.5)).toBeCloseTo(0.5, 5);
  });

  it('tracks a fast movement almost immediately', () => {
    // This is the reported problem: the overlay must not trail a quick squat.
    drawAndReadHipY(0.5);
    // A big jump (0.1 of the frame) is unambiguously real movement, so the
    // filter should relax and follow it in a single frame.
    const drawn = drawAndReadHipY(0.6);
    expect(drawn).toBeGreaterThan(0.59);
  });

  it('keeps up over a sustained fast descent instead of accumulating lag', () => {
    // Steady descent like a real squat; by the end the overlay must be within a
    // fraction of a percent of the true hip position.
    let y = 0.4;
    drawAndReadHipY(y);
    let drawn = y;
    for (let i = 0; i < 15; i++) {
      y += 0.25 / 15;
      drawn = drawAndReadHipY(y);
    }
    expect(Math.abs(drawn - y)).toBeLessThan(0.002);
  });

  it('damps small jitter while the user holds still', () => {
    // Alternating sub-pixel noise around a fixed point must be attenuated, not
    // reproduced 1:1 — otherwise a standing skeleton shimmers.
    const centre = 0.5;
    const noise = 0.002;
    drawAndReadHipY(centre);
    let worst = 0;
    for (let i = 0; i < 40; i++) {
      const drawn = drawAndReadHipY(centre + (i % 2 ? noise : -noise));
      if (i > 5) worst = Math.max(worst, Math.abs(drawn - centre));
    }
    // Strictly less than the raw noise amplitude: jitter is being suppressed.
    expect(worst).toBeLessThan(noise);
  });

  it('resets between sessions so a new user does not inherit the old position', () => {
    drawAndReadHipY(0.3);
    resetSkeletonSmoothing();
    // After a reset the next frame is a "first frame" again — exact, not eased
    // from the previous user's pose.
    expect(drawAndReadHipY(0.7)).toBeCloseTo(0.7, 5);
  });
});
