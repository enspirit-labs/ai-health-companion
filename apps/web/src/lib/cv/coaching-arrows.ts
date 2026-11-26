import { POSE_LM, type Landmark } from './pose-visibility';
import type { StanceVerdict } from './leg-stance';

/**
 * On-camera coaching arrows — a big directional cue drawn over the feed to tell
 * the user how to correct their squat (go lower, feet closer, feet wider), like
 * the arrow annotations in modern fitness apps.
 *
 * This module is split into a PURE decision half (`computeArrowHints`, unit
 * tested) and a canvas drawing half (`drawArrows`). The decision half places
 * each arrow at the relevant body landmark in normalized [0,1] space so the
 * drawer just scales to pixels.
 */

const MIN_VISIBILITY = 0.5;

export type ArrowDirection = 'down' | 'in' | 'out';

export interface ArrowHint {
  /** Which way the arrow points. */
  direction: ArrowDirection;
  /** Arrow anchor in normalized [0,1] coordinates (the tail/centre it emanates from). */
  x: number;
  y: number;
}

export interface ArrowInputs {
  landmarks: Landmark[] | undefined;
  /** Current leg-stance verdict (drives the in/out feet arrows). */
  stance: StanceVerdict;
  /** True when the user is mid-squat but hasn't reached depth (→ "go lower"). */
  needsDepth: boolean;
}

function isVisible(lm: Landmark | undefined): lm is Landmark {
  return lm != null && (lm.visibility ?? 0) >= MIN_VISIBILITY;
}

function midpoint(a: Landmark | undefined, b: Landmark | undefined): { x: number; y: number } | null {
  if (!isVisible(a) || !isVisible(b)) return null;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Decides which coaching arrows to show this frame. Returns an empty array when
 * nothing needs correcting or the relevant landmarks aren't visible.
 *
 * - `needsDepth` → one big DOWN arrow just below the hips ("go lower").
 * - stance `too-wide` → an IN arrow at each ankle ("bring feet together").
 * - stance `too-narrow` → an OUT arrow at each ankle ("widen stance").
 */
export function computeArrowHints(inputs: ArrowInputs): ArrowHint[] {
  const { landmarks, stance, needsDepth } = inputs;
  const at = (i: number) => landmarks?.[i];
  const hints: ArrowHint[] = [];

  // Depth arrow — anchored just below the hip midpoint, pointing down.
  if (needsDepth) {
    const hip = midpoint(at(POSE_LM.leftHip), at(POSE_LM.rightHip));
    if (hip) hints.push({ direction: 'down', x: hip.x, y: hip.y });
  }

  // Feet arrows — one at each ankle, pointing in (too wide) or out (too narrow).
  if (stance === 'too-wide' || stance === 'too-narrow') {
    const lAnkle = at(POSE_LM.leftAnkle);
    const rAnkle = at(POSE_LM.rightAnkle);
    if (isVisible(lAnkle) && isVisible(rAnkle)) {
      const dir: ArrowDirection = stance === 'too-wide' ? 'in' : 'out';
      // "in" points toward the body centre; "out" points away. Left ankle is the
      // one with the smaller x. We encode the horizontal direction per side at
      // draw time from `direction` + which side the anchor is on.
      hints.push({ direction: dir, x: lAnkle.x, y: lAnkle.y });
      hints.push({ direction: dir, x: rAnkle.x, y: rAnkle.y });
    }
  }

  return hints;
}

// --- Canvas drawing -------------------------------------------------------

const ARROW_COLOR = 'rgba(239, 68, 68, 0.85)'; // red, matching the reference
const ARROW_GLOW = 'rgba(239, 68, 68, 0.6)';

/** Draws a filled arrow (shaft + head) from `(x,y)` extending `length` px in the
 * unit direction `(dx,dy)`, `width` px wide. */
function drawArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dx: number,
  dy: number,
  length: number,
  width: number,
) {
  const nx = -dy; // perpendicular
  const ny = dx;
  const tipX = x + dx * length;
  const tipY = y + dy * length;
  const headLen = length * 0.45;
  const headBackX = tipX - dx * headLen;
  const headBackY = tipY - dy * headLen;
  const shaftHalf = width * 0.28;
  const headHalf = width * 0.6;

  ctx.beginPath();
  // Shaft (rectangle from base to head-back), then arrowhead triangle to tip.
  ctx.moveTo(x + nx * shaftHalf, y + ny * shaftHalf);
  ctx.lineTo(headBackX + nx * shaftHalf, headBackY + ny * shaftHalf);
  ctx.lineTo(headBackX + nx * headHalf, headBackY + ny * headHalf);
  ctx.lineTo(tipX, tipY);
  ctx.lineTo(headBackX - nx * headHalf, headBackY - ny * headHalf);
  ctx.lineTo(headBackX - nx * shaftHalf, headBackY - ny * shaftHalf);
  ctx.lineTo(x - nx * shaftHalf, y - ny * shaftHalf);
  ctx.closePath();
  ctx.fill();
}

/**
 * Renders coaching arrows onto the overlay canvas. Sizes scale with the canvas
 * width so they read the same at any resolution. Meant to be called right after
 * drawSkeleton, on the same context, each frame.
 *
 * NOTE: the canvas is mirrored (scale-x-[-1]) to match the selfie video, so
 * horizontal "in"/"out" directions are expressed in the same mirrored space as
 * the landmarks — no extra flip needed here.
 */
export function drawArrows(
  ctx: CanvasRenderingContext2D,
  hints: ArrowHint[],
  width: number,
  height: number,
) {
  if (hints.length === 0) return;
  const centerX = 0.5 * width;

  ctx.save();
  ctx.fillStyle = ARROW_COLOR;
  ctx.shadowColor = ARROW_GLOW;
  ctx.shadowBlur = Math.round(width * 0.01);

  for (const hint of hints) {
    const x = hint.x * width;
    const y = hint.y * height;

    if (hint.direction === 'down') {
      // Big downward arrow starting a little below the hips.
      const len = Math.max(60, width * 0.16);
      const w = Math.max(30, width * 0.09);
      drawArrow(ctx, x, y + height * 0.03, 0, 1, len, w);
    } else {
      // Feet arrows: horizontal. "in" points toward centre, "out" away from it.
      const len = Math.max(40, width * 0.1);
      const w = Math.max(18, width * 0.05);
      const towardCenter = x < centerX ? 1 : -1; // +1 points right (toward centre if left of centre)
      const sign = hint.direction === 'in' ? towardCenter : -towardCenter;
      drawArrow(ctx, x, y, sign, 0, len, w);
    }
  }

  ctx.restore();
}
