import { FACE_LM, type FaceLandmark } from './face-framing';

/** How many faces the frame contains, as far as the detector can tell.
 * `face-landmarker-loader.ts` requests `numFaces: 2` specifically so
 * 'multiple' is distinguishable from 'single' — a third person simply isn't
 * reported, which doesn't matter since two is already a rejection. */
export type FacePresence = 'none' | 'single' | 'multiple';

/** Counts the non-empty landmark sets in a MediaPipe
 * `FaceLandmarkerResult.faceLandmarks`. Empty sets are filtered defensively —
 * a present-but-empty set isn't something the model is expected to emit, but
 * treating one as a person would reject a legitimate solo user. */
export function classifyFacePresence(faceLandmarkSets: FaceLandmark[][] | undefined): FacePresence {
  const count = (faceLandmarkSets ?? []).filter((set) => Array.isArray(set) && set.length > 0).length;
  if (count === 0) return 'none';
  if (count === 1) return 'single';
  return 'multiple';
}

function distance(a: FaceLandmark | undefined, b: FaceLandmark | undefined): number | null {
  if (!a || !b) return null;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Eye-aspect ratio (EAR) for one eye, from face-framing's
 * `[outer, inner, top, bottom]` index tuple: the eyelid gap divided by the
 * corner-to-corner span. Euclidean distances rather than raw Δy/Δx so head
 * roll doesn't skew the ratio (a tilted head still has the same eye shape). */
function singleEyeAspectRatio(landmarks: FaceLandmark[], indices: readonly number[]): number | null {
  const [outer, inner, top, bottom] = indices;
  const horizontal = distance(landmarks[outer], landmarks[inner]);
  const vertical = distance(landmarks[top], landmarks[bottom]);
  if (horizontal === null || vertical === null || horizontal === 0) return null;
  return vertical / horizontal;
}

/** Mean eye-aspect ratio across both eyes — roughly 0.3 for open eyes and
 * under 0.15 for closed ones, though the exact numbers depend on the
 * individual, so `LivenessTracker` uses hysteresis rather than one cut point.
 * Returns null when either eye's landmarks are missing or degenerate, which
 * callers treat as "no usable blink signal", not as "eyes closed". */
export function eyeAspectRatio(landmarks: FaceLandmark[] | undefined): number | null {
  if (!landmarks || landmarks.length === 0) return null;
  const right = singleEyeAspectRatio(landmarks, FACE_LM.rightEye);
  const left = singleEyeAspectRatio(landmarks, FACE_LM.leftEye);
  if (right === null || left === null) return null;
  return (right + left) / 2;
}

export type LivenessRejectReason = 'no_face' | 'static_frame' | 'awaiting_blink' | null;

export interface LivenessResult {
  /** True only when a face is present, the feed is genuinely changing, and a
   * natural blink has been observed recently. */
  isLive: boolean;
  reason: LivenessRejectReason;
  /** Whether the eyes are open *on this tick* (EAR at or above
   * `earOpenThreshold`). Distinct from `isLive`, which stays true for the
   * whole blink-recency window: a frame captured mid-blink is a bad photo
   * even though the person is unambiguously live. False whenever there's no
   * usable EAR at all. */
  eyesOpen: boolean;
  /** Blinks still inside the recency window. */
  blinkCount: number;
  /** Total nose-tip movement across the motion window, in normalized units —
   * 0 until the window has filled. */
  motion: number;
}

export interface LivenessOptions {
  /** EAR at or below which the eyes read closed (arms a blink). */
  earClosedThreshold?: number;
  /** EAR at or above which the eyes read open again (completes a blink).
   * Deliberately above `earClosedThreshold`: with one shared cut point, EAR
   * noise sitting right on it would machine-gun fake blinks. */
  earOpenThreshold?: number;
  /** How recently a blink must have happened for the feed to read live.
   * Bounded (rather than "has ever blinked") so a spoofer can't blink once
   * for the camera and then hold up a photo. */
  blinkWindowMs?: number;
  /** Rolling window, in inference ticks, for the static-frame check. */
  motionWindowSize?: number;
  /** Total nose-tip movement across a full motion window below which the
   * feed is treated as a still image rather than a live person. */
  minNaturalMotion?: number;
}

// Starting estimates, not live-tuned — same posture as face-mesh-capture.tsx's
// MIN_YAW_OFFSET_RATIO/MIN_PITCH_OFFSET_RATIO. Confirm against real-camera
// numbers via that file's DEBUG_LIVENESS_LOGGING before relying on them:
// too strict an EAR pair nags users who blink lightly, too loose a
// MIN_NATURAL_MOTION lets a tripod-mounted photo through.
const DEFAULT_EAR_CLOSED_THRESHOLD = 0.18;
const DEFAULT_EAR_OPEN_THRESHOLD = 0.24;
// Humans blink roughly every 2-10s; 12s leaves headroom for a light blinker
// while still being a bounded window.
const DEFAULT_BLINK_WINDOW_MS = 12_000;
// Matches RegionMotionTracker's default — ~1s at face-mesh-capture's 130ms
// inference interval.
const DEFAULT_MOTION_WINDOW_SIZE = 8;
const DEFAULT_MIN_NATURAL_MOTION = 0.004;

function totalMovement(history: FaceLandmark[]): number {
  let total = 0;
  for (let i = 1; i < history.length; i += 1) {
    total += Math.hypot(history[i].x - history[i - 1].x, history[i].y - history[i - 1].y);
  }
  return total;
}

/**
 * Liveness signal for the Face Assessment: is this a live
 * human in front of the camera, or a photo / propped-up screen / paused
 * video?
 *
 * Two independent checks, because each covers the other's blind spot:
 *
 * - **Natural blinking.** A printed photograph or a still on a screen never
 *   blinks. Recorded on the *reopening* edge of a close→open cycle, so a
 *   half-signal (eyes closed and held, e.g. a photo of someone mid-blink)
 *   never counts.
 * - **Frame is actually changing.** A live face is never perfectly still —
 *   even a person "holding still" drifts by a measurable amount every tick.
 *   A tripod-mounted phone showing a photo, or a paused video, produces
 *   landmark positions that don't move at all. This is what catches a spoof
 *   that hasn't been on camera long enough to have missed a blink window yet.
 *
 * Instantiate once per capture screen (e.g. via useRef) and call `update()`
 * once per inference tick, the same cadence as `CaptureGateTracker`. The
 * result is meant to be fed into that gate as a tracked region rather than
 * acted on directly, so a single noisy tick can't flip the capture button.
 */
export class LivenessTracker {
  private readonly earClosedThreshold: number;
  private readonly earOpenThreshold: number;
  private readonly blinkWindowMs: number;
  private readonly motionWindowSize: number;
  private readonly minNaturalMotion: number;

  private eyesClosed = false;
  private blinkTimestamps: number[] = [];
  private noseHistory: FaceLandmark[] = [];

  constructor(options: LivenessOptions = {}) {
    this.earClosedThreshold = options.earClosedThreshold ?? DEFAULT_EAR_CLOSED_THRESHOLD;
    this.earOpenThreshold = options.earOpenThreshold ?? DEFAULT_EAR_OPEN_THRESHOLD;
    this.blinkWindowMs = options.blinkWindowMs ?? DEFAULT_BLINK_WINDOW_MS;
    this.motionWindowSize = options.motionWindowSize ?? DEFAULT_MOTION_WINDOW_SIZE;
    this.minNaturalMotion = options.minNaturalMotion ?? DEFAULT_MIN_NATURAL_MOTION;
  }

  update(landmarks: FaceLandmark[] | undefined, nowMs: number): LivenessResult {
    this.pruneBlinks(nowMs);

    const ear = eyeAspectRatio(landmarks);
    const nose = landmarks?.[FACE_LM.nose[0]];

    if (ear === null || !nose) {
      // A gap makes the window's movement total meaningless, so the motion
      // history restarts — same semantics as RegionMotionTracker.update(null).
      // Blink history deliberately survives: briefly losing the face
      // shouldn't erase a blink the user genuinely made.
      this.noseHistory = [];
      this.eyesClosed = false;
      return {
        isLive: false,
        reason: 'no_face',
        eyesOpen: false,
        blinkCount: this.blinkTimestamps.length,
        motion: 0,
      };
    }

    if (this.eyesClosed) {
      if (ear >= this.earOpenThreshold) {
        this.eyesClosed = false;
        this.blinkTimestamps.push(nowMs);
      }
    } else if (ear <= this.earClosedThreshold) {
      this.eyesClosed = true;
    }

    this.noseHistory.push({ x: nose.x, y: nose.y });
    if (this.noseHistory.length > this.motionWindowSize) this.noseHistory.shift();

    const windowFull = this.noseHistory.length >= this.motionWindowSize;
    const motion = windowFull ? totalMovement(this.noseHistory) : 0;
    const blinkCount = this.blinkTimestamps.length;
    // Instantaneous, not the hysteresis state: `eyesClosed` deliberately stays
    // armed through the mid-zone between the thresholds, but a frame whose EAR
    // is still in that mid-zone is a half-shut eye, not one a capture should
    // land on.
    const eyesOpen = ear >= this.earOpenThreshold;

    // Static beats awaiting-blink: if the feed isn't changing at all, telling
    // the user to blink is misleading guidance — nothing they do to a photo
    // will help.
    if (windowFull && motion < this.minNaturalMotion) {
      return { isLive: false, reason: 'static_frame', eyesOpen, blinkCount, motion };
    }
    if (blinkCount === 0) {
      return { isLive: false, reason: 'awaiting_blink', eyesOpen, blinkCount, motion };
    }
    return { isLive: true, reason: null, eyesOpen, blinkCount, motion };
  }

  /** Clears all blink and motion history — call on retake, so a previous
   * attempt's blink can't vouch for a fresh one. */
  reset(): void {
    this.eyesClosed = false;
    this.blinkTimestamps = [];
    this.noseHistory = [];
  }

  /** Read-only introspection for threshold tuning — not used by `update()`
   * itself. Same purpose as CaptureGateTracker.getDebugSnapshot(), and
   * consumed by face-mesh-capture.tsx's DEBUG_LIVENESS_LOGGING block: it
   * exposes the internal `eyesClosed` arm state and how full the motion
   * window is, neither of which `LivenessResult` carries. */
  getDebugSnapshot(): { eyesClosed: boolean; blinkCount: number; motion: number; samples: number } {
    return {
      eyesClosed: this.eyesClosed,
      blinkCount: this.blinkTimestamps.length,
      motion: this.noseHistory.length >= this.motionWindowSize ? totalMovement(this.noseHistory) : 0,
      samples: this.noseHistory.length,
    };
  }

  private pruneBlinks(nowMs: number): void {
    this.blinkTimestamps = this.blinkTimestamps.filter((at) => nowMs - at <= this.blinkWindowMs);
  }
}
