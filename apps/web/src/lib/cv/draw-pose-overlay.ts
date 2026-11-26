import { POSE_LM, type Landmark } from './pose-visibility';
import type { PoseConnection } from './pose-loader';

// Single flat neon green, matching the reference motion-capture look. There is
// deliberately no second (red) scheme: the overlay's job is to show the user
// their tracked body, and recolouring half of it on a confidence dip reads as
// "something is broken" rather than as guidance. Parts we aren't sure about
// fade out instead (see confidenceAlpha), and the separate region checklist is
// what actually tells the user a body part isn't in frame.
const GREEN_LINE = '#2BE82B';
const GREEN_DOT = '#2BE82B';

// Geometry is authored in px for a ~640px-wide feed, then scaled to the actual
// canvas so proportions hold at any resolution.
const REF_WIDTH = 640;

/** Per-bone half-widths at each end, in reference px. The reference overlay's
 * limb shapes are strongly TAPERED — wide at the joint nearer the body's core
 * and narrowing to nearly a point at the extremity (thigh broad at the hip →
 * slim at the knee, forearm broad at the elbow → slim at the wrist). Roughly
 * a 4:1 ratio, which is what gives the overlay its "bone" read rather than
 * looking like plumbing. `a`/`b` map to the bone's own endpoints, so the taper
 * direction is encoded per bone. */
const TAPER = {
  upperArm: { a: 6, b: 2 },
  forearm: { a: 5, b: 1.75 },
  thigh: { a: 9, b: 2.25 },
  shin: { a: 6.5, b: 2 },
  // The torso's side beam: shoulder down to hip. The longest shape on the body
  // in the reference, broad at the shoulder and narrowing into the hip.
  torsoSide: { a: 7, b: 2.5 },
} as const;

/** Fraction of its length each limb shape is pulled back from both joints. In
 * the reference the tapered outlines stop short of the joint dots rather than
 * running into them, which keeps the joints readable as distinct markers. */
const LIMB_INSET = 0.08;

/** Half-thickness of the two horizontal torso bars (shoulder line and pelvis
 * line), drawn as slim rounded rectangles rather than tapered limbs. */
const BAR_HALF_HEIGHT = 5;
/** The pelvis bar spans the middle of the hip line, reading as a small buckle
 * between the hip joints rather than a full-width bar. */
const PELVIS_BAR_SPAN = 0.55;
/** The shoulder bar runs nearly the full shoulder width, insetting just enough
 * to clear the two shoulder dots. */
const SHOULDER_BAR_SPAN = 0.84;

const JOINT_RADIUS_PX = 9; // flat filled joint dots — larger than the bone width
const STROKE_PX = 2.5; // outline weight for the hollow limb shapes

/** The curated tapered-bone set. The trunk's INTERIOR is left open (only the
 * shoulder and pelvis bars cross it, drawn separately) so the user's own torso
 * lean stays visible — but its two SIDES are drawn, running shoulder→hip down
 * each flank exactly as in the reference. Those side beams are what visually
 * ties the upper body to the pelvis; without them the skeleton reads as a
 * floating shoulder bar above disconnected legs. */
interface Bone {
  a: number;
  b: number;
  width: keyof typeof TAPER;
}
const BONES: Bone[] = [
  // Torso sides — shoulder down the flank into the hip.
  { a: POSE_LM.leftShoulder, b: POSE_LM.leftHip, width: 'torsoSide' },
  { a: POSE_LM.rightShoulder, b: POSE_LM.rightHip, width: 'torsoSide' },
  // Arms — wide at the proximal joint (shoulder/elbow), narrow toward the hand.
  { a: POSE_LM.leftShoulder, b: POSE_LM.leftElbow, width: 'upperArm' },
  { a: POSE_LM.rightShoulder, b: POSE_LM.rightElbow, width: 'upperArm' },
  { a: POSE_LM.leftElbow, b: POSE_LM.leftWrist, width: 'forearm' },
  { a: POSE_LM.rightElbow, b: POSE_LM.rightWrist, width: 'forearm' },
  // Legs — wide at the hip/knee, narrow toward the ankle.
  { a: POSE_LM.leftHip, b: POSE_LM.leftKnee, width: 'thigh' },
  { a: POSE_LM.rightHip, b: POSE_LM.rightKnee, width: 'thigh' },
  { a: POSE_LM.leftKnee, b: POSE_LM.leftAnkle, width: 'shin' },
  { a: POSE_LM.rightKnee, b: POSE_LM.rightAnkle, width: 'shin' },
];

/** Landmarks rendered as joint dots — the endpoints of the bones above, which
 * works out to shoulders, elbows, wrists, hips, knees and ankles. No face,
 * hand, or foot detail, matching the reference. */
const JOINT_INDICES = Array.from(new Set(BONES.flatMap((bone) => [bone.a, bone.b])));

const VISIBILITY_THRESHOLD = 0.5;
/** Maps a raw visibility to a drawing opacity: full above the threshold, fading
 * smoothly to a floor below it, so a part we're unsure about dims out instead
 * of popping in and out or changing colour. */
function confidenceAlpha(v: number | undefined): number {
  const vis = v ?? 0;
  if (vis >= VISIBILITY_THRESHOLD) return 1;
  // Linear fade from the threshold down to 0, floored at 0.15 so a barely-seen
  // limb still hints its position.
  return Math.max(0.15, vis / VISIBILITY_THRESHOLD);
}

// --- Keypoint smoothing (velocity-adaptive) -------------------------------
//
// A plain fixed-alpha EMA forces one tradeoff for all motion: low alpha kills
// jitter but visibly drags behind a fast squat, high alpha tracks well but lets
// a standing pose shimmer. There is no single good value.
//
// So the smoothing factor adapts to how fast the keypoint is actually moving:
//   - barely moving  → SMOOTHING_MIN, heavy smoothing, jitter suppressed
//   - moving fast    → SMOOTHING_MAX (≈1), essentially unfiltered, no lag
//
// Jitter is small-amplitude by nature and real movement is large-amplitude, so
// per-frame displacement separates them cleanly. This gives a steady overlay at
// rest AND a responsive one during the descent, which a fixed alpha cannot.
//
// Kept module-level (one overlay at a time); reset via resetSkeletonSmoothing().

/** Smoothing factor when the keypoint is essentially still. Low = steady. */
const SMOOTHING_MIN = 0.55;
/** Smoothing factor once the keypoint is moving at or beyond FAST_MOVE_DIST.
 * Just under 1 so a single wildly-off detection still can't snap the joint. */
const SMOOTHING_MAX = 0.98;
/** Per-frame displacement (in normalized units) treated as "moving fast", at
 * which smoothing is fully relaxed to SMOOTHING_MAX. ~1.5% of the frame per
 * frame is brisk deliberate movement rather than detector noise. */
const FAST_MOVE_DIST = 0.015;

let smoothed: Array<{ x: number; y: number } | null> = [];

export function resetSkeletonSmoothing() {
  smoothed = [];
}

/** Maps this frame's displacement to a smoothing factor, ramping linearly from
 * SMOOTHING_MIN (still) up to SMOOTHING_MAX (at/above FAST_MOVE_DIST). */
function adaptiveAlpha(distance: number): number {
  const t = Math.min(1, distance / FAST_MOVE_DIST);
  return SMOOTHING_MIN + (SMOOTHING_MAX - SMOOTHING_MIN) * t;
}

function smoothLandmark(index: number, lm: Landmark): { x: number; y: number } {
  const prev = smoothed[index];
  if (!prev) {
    const first = { x: lm.x, y: lm.y };
    smoothed[index] = first;
    return first;
  }
  const alpha = adaptiveAlpha(Math.hypot(lm.x - prev.x, lm.y - prev.y));
  const next = { x: prev.x + alpha * (lm.x - prev.x), y: prev.y + alpha * (lm.y - prev.y) };
  smoothed[index] = next;
  return next;
}

/** Traces a tapered quadrilateral around segment a→b — `halfA` wide at the a
 * end, `halfB` at the b end. This is the reference overlay's limb shape: an
 * elongated wedge that reads as a bone rather than a uniform tube. The ends are
 * left flat (no round caps) because the joint dots drawn on top cover them,
 * exactly as in the reference. */
function taperedLimbPath(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  halfA: number,
  halfB: number,
) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len === 0) return;
  // Unit normal to the bone: offsetting each end by its own half-width along
  // this is what produces the taper.
  const nx = -dy / len;
  const ny = dx / len;

  ctx.beginPath();
  ctx.moveTo(ax + nx * halfA, ay + ny * halfA);
  ctx.lineTo(bx + nx * halfB, by + ny * halfB);
  ctx.lineTo(bx - nx * halfB, by - ny * halfB);
  ctx.lineTo(ax - nx * halfA, ay - ny * halfA);
  ctx.closePath();
}

/** Traces a rounded bar centred on the segment a→b, shortened to `span` of its
 * full length. Used for the shoulder and pelvis bars, which in the reference
 * are slim rounded rectangles inset from the joints they connect. */
function barPath(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  halfHeight: number,
  span: number,
) {
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const dx = (bx - ax) * span * 0.5;
  const dy = (by - ay) * span * 0.5;
  const x1 = mx - dx;
  const y1 = my - dy;
  const x2 = mx + dx;
  const y2 = my + dy;

  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len === 0) return;
  const nx = -(y2 - y1) / len;
  const ny = (x2 - x1) / len;
  const hx = nx * halfHeight;
  const hy = ny * halfHeight;
  const angle = Math.atan2(y2 - y1, x2 - x1);

  ctx.beginPath();
  ctx.moveTo(x1 + hx, y1 + hy);
  ctx.lineTo(x2 + hx, y2 + hy);
  ctx.arc(x2, y2, halfHeight, angle + Math.PI / 2, angle - Math.PI / 2, true);
  ctx.lineTo(x1 - hx, y1 - hy);
  ctx.arc(x1, y1, halfHeight, angle - Math.PI / 2, angle + Math.PI / 2, true);
  ctx.closePath();
}

/**
 * Draws the motion-capture-style pose overlay shared by the squats and
 * posture assessments, matching the reference exercise footage: hollow tapered neon-green outlines
 * for the limbs and the two torso side beams (wide at the proximal joint,
 * narrowing toward the extremity), flat filled joint dots, and horizontal bars
 * across the shoulder and pelvis lines with the trunk's interior left open.
 * Keypoints are EMA-smoothed for stability and fade out as confidence drops.
 * Facial landmarks are excluded.
 *
 * The limb shapes are stroked but NOT filled — the user needs to see their own
 * body through the overlay to judge their form, which a translucent fill
 * muddies.
 *
 * The `connections` arg is unused — this overlay uses its own curated bone set
 * — but kept in the signature for call-site compatibility.
 */
export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  _connections: PoseConnection[],
  width: number,
  height: number,
) {
  const scale = width / REF_WIDTH;
  const px = (p: { x: number; y: number }) => ({ x: p.x * width, y: p.y * height });
  // Floors keep the skeleton legible on small/low-res feeds, where a pure
  // proportional scale would collapse the thinner ends to sub-pixel widths.
  const half = (v: number) => Math.max(1.5, v * scale);

  // Smooth every joint we might draw, once per frame.
  const pos: Record<number, { x: number; y: number }> = {};
  const vis: Record<number, number> = {};
  for (const i of JOINT_INDICES) {
    const lm = landmarks[i];
    if (!lm) continue;
    pos[i] = smoothLandmark(i, lm);
    vis[i] = lm.visibility ?? 0;
  }

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1.5, STROKE_PX * scale);
  ctx.strokeStyle = GREEN_LINE;

  /** Both endpoints must be tracked at all for a shape to be drawn; the pair's
   * weaker confidence then sets its opacity. */
  const pairAlpha = (a: number, b: number) => Math.min(confidenceAlpha(vis[a]), confidenceAlpha(vis[b]));

  // --- Torso: shoulder bar + pelvis bar, no diagonals ----------------------
  // The reference leaves the trunk open (only these two bars), so the user's
  // actual torso lean stays visible — which is what a squat assessment is
  // watching. Drawn first so joint dots overlap their ends.
  const bars: Array<{ a: number; b: number; span: number }> = [
    { a: POSE_LM.leftShoulder, b: POSE_LM.rightShoulder, span: SHOULDER_BAR_SPAN },
    { a: POSE_LM.leftHip, b: POSE_LM.rightHip, span: PELVIS_BAR_SPAN },
  ];
  for (const bar of bars) {
    const pa = pos[bar.a];
    const pb = pos[bar.b];
    if (!pa || !pb) continue;
    const a = px(pa);
    const b = px(pb);
    ctx.globalAlpha = pairAlpha(bar.a, bar.b);
    barPath(ctx, a.x, a.y, b.x, b.y, half(BAR_HALF_HEIGHT), bar.span);
    ctx.stroke();
  }

  // --- Limbs as hollow tapered outlines ------------------------------------
  for (const bone of BONES) {
    const pa = pos[bone.a];
    const pb = pos[bone.b];
    if (!pa || !pb) continue;
    const a = px(pa);
    const b = px(pb);
    // Pull both ends back so the shape stops short of the joint dots.
    const ix = (b.x - a.x) * LIMB_INSET;
    const iy = (b.y - a.y) * LIMB_INSET;
    const taper = TAPER[bone.width];
    ctx.globalAlpha = pairAlpha(bone.a, bone.b);
    taperedLimbPath(ctx, a.x + ix, a.y + iy, b.x - ix, b.y - iy, half(taper.a), half(taper.b));
    ctx.stroke();
  }

  // --- Flat filled joint dots ----------------------------------------------
  // Drawn last so they cap the limbs' open ends, as in the reference.
  const r = Math.max(3, JOINT_RADIUS_PX * scale);
  ctx.fillStyle = GREEN_DOT;
  for (const i of JOINT_INDICES) {
    const p = pos[i];
    if (!p) continue;
    const { x, y } = px(p);
    ctx.globalAlpha = confidenceAlpha(vis[i]);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

