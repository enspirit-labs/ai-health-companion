'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CheckCircle2, Compass, Eye, Fingerprint, Focus, RotateCcw, Ruler, ScanFace, ScanLine, Smile, Sun } from 'lucide-react';
import type { FaceLandmarker } from '@mediapipe/tasks-vision';

import { Button } from '@/components/ui/button';
import { CameraStage, CAMERA_FEED_CLASS } from '@/components/camera-stage';
import { MediaErrorState } from '@/components/media-error-state';
import { cn } from '@/lib/utils';
import { AiStatusPanel, type AiStatusItem } from '@/components/face-assessment/ai-status-panel';
import { CaptureCountdown, CaptureSuccessBurst } from '@/components/face-assessment/capture-countdown';
import { FaceScanFrame } from '@/components/face-assessment/face-scan-frame';
import { FaceScanHighlights, SCAN_CATEGORIES, SCAN_CATEGORY_INTERVAL_MS, type ScanAnchors } from '@/components/face-assessment/face-scan-highlights';
import { FaceScanLoading } from '@/components/face-assessment/face-scan-loading';
import { FaceScanTopBar } from '@/components/face-assessment/face-scan-topbar';
import { GuidanceToast, useGuidanceToast } from '@/components/face-assessment/guidance-toast';
import { CaptureGateTracker, maybeAutoCapture } from '@/lib/cv/capture-gate';
import { getFaceLandmarker } from '@/lib/cv/face-landmarker-loader';
import { deriveChipState, type FaceScanState } from '@/lib/cv/face-scan-theme';
import {
  classifyEyeSizeSymmetry,
  classifyFaceFraming,
  classifyMouthOpenness,
  eyeBoundingBox,
  eyeSizeSymmetryRatio,
  faceBoundingBox,
  faceWidthRatio,
  FACE_LM,
  foreheadReferenceBox,
  headTiltDegrees,
  jawBoundingBox,
  mouthBoundingBox,
  mouthOpenRatio,
  noseYawOffsetRatio,
  type FaceLandmark,
  type FaceRegionKey,
} from '@/lib/cv/face-framing';
import { classifyFacePresence, eyeAspectRatio, LivenessTracker } from '@/lib/cv/face-liveness';
import { evaluateFrameQuality, type PixelFrame } from '@/lib/cv/frame-quality';
import {
  evaluateLightingQuality,
  sampleLightingDebugMetrics,
  sampleLightingImageData,
  type LightingCheckReason,
} from '@/lib/cv/lighting-quality';
import { classifyRegionOcclusionAdaptive, type AdaptiveOcclusionResult, type NormalizedBox } from '@/lib/cv/pixel-analysis';
import { RegionMotionTracker } from '@/lib/cv/region-motion';
import { cameraErrorMessage, requestCameraStream, type MediaAccessError } from '@/lib/media/user-media';
import { INITIAL_VOICE_GUIDANCE_STATE, speak, speakGuidance, stopSpeaking, type VoiceGuidanceState } from '@/lib/media/voice-guidance';

export type FaceAssessmentKind = 'face' | 'eye' | 'tongue' | 'skin';
/** For assessmentKind 'eye' — which head pose this specific shot requires.
 * Defaults to 'center' when omitted. 'up'/'down' were dropped — Eye now only
 * collects center/left/right. */
export type HeadDirection = 'center' | 'left' | 'right';

interface Props {
  isSubmitting: boolean;
  onCapture: (blob: Blob) => void;
  promptText?: string;
  /** Which face regions must be confirmed before the capture button enables.
   * The whole-face size check (too close/too far) always applies on top of these. */
  requiredRegions: FaceRegionKey[];
  /** Selects which extra orientation/quality checks and messages apply. */
  assessmentKind?: FaceAssessmentKind;
  /** Only meaningful when assessmentKind is 'eye' — which head pose this
   * shot requires (the Eye Assessment's 5-photo sequence needs a different
   * check per photo, not just "is a face detected"). Defaults to 'center'. */
  requiredHeadDirection?: HeadDirection;
  /** How long (ms) every required condition must hold before capture enables. */
  holdMs?: number;
}

const INFER_INTERVAL_MS = 130;
const MIN_MOUTH_OPEN_RATIO = 0.045;
const DEFAULT_HOLD_MS = 500;
// Lighting changes slowly — sampling it a couple of times a second is plenty
// and far cheaper than every face-inference tick (same rationale as
// squats-test.tsx's own LIGHTING_INTERVAL_MS, and posture-capture.tsx's).
const LIGHTING_INTERVAL_MS = 500;
// Spoken (and shown) once every required region has held confirmed long
// enough that auto-capture is about to fire — matches the on-screen copy
// below so what's said and what's shown never disagree.
const READY_MESSAGE = 'Great — hold steady, you can capture now';
const JUST_CAPTURED_DURATION_MS = 2500;
// Face and Eye Assessment both show a visible 3-2-1 countdown once every
// check passes, rather than capturing the instant the gate's own hold timer
// clears — timed off the same `now` the inference loop already threads
// through, not a separate setInterval, so it naturally pauses with the rest
// of the loop on a backgrounded tab. Tongue and Posture still capture
// instantly via maybeAutoCapture() — unchanged.
const CAPTURE_COUNTDOWN_SECONDS = 3;

type FaceRejectReason =
  | 'frontal'
  | 'faceTooSmall'
  | 'faceTooBig'
  | 'clipped'
  | 'eyeSymmetry'
  | 'mouthNotOpen'
  | 'occluded'
  | 'faceSize'
  | 'faceBlocked'
  | 'eyesOutOfFrame'
  | 'headTilted'
  | 'blurry'
  | 'turnLeftMore'
  | 'turnRightMore'
  | 'multipleFaces'
  | 'notLive'
  | 'awaitingBlink'
  | null;

const REJECT_MESSAGES: Record<Exclude<FaceRejectReason, null>, string> = {
  frontal: 'Please face the camera directly.',
  faceTooSmall: 'Move closer so your face fills more of the circle.',
  faceTooBig: 'Move back a little.',
  clipped: 'Center your face in the frame.',
  eyeSymmetry: 'Please face the camera directly.',
  mouthNotOpen: 'Please open your mouth wider and extend your tongue.',
  occluded: 'Make sure nothing is blocking your mouth.',
  faceSize: 'Move closer or further so your face fills the circle.',
  faceBlocked: 'Your face is blocked. Please make sure your face is fully visible.',
  eyesOutOfFrame: 'Keep both eyes fully inside the frame.',
  headTilted: 'Please level your head — try not to tilt it to either side.',
  blurry: 'Hold still — the image looks blurry.',
  turnLeftMore: 'Please turn your head further to the left.',
  turnRightMore: 'Please turn your head further to the right.',
  multipleFaces: 'More than one person is in frame. Please make sure you are the only person visible.',
  notLive: 'We can’t confirm a live person. Please use your own live camera — photos, screens and paused videos aren’t accepted.',
  // Deliberately doesn't say "look at the camera" — for assessmentKind 'eye',
  // this fires during the left/right steps too, where looking away from the
  // camera is the whole point of the step. "Blink naturally" alone is correct
  // for every direction, and for Face too (which already gates
  // "facing the camera" separately via 'frontal').
  awaitingBlink: 'Please blink naturally so we can confirm you’re live.',
};

const LIGHTING_MESSAGES: Record<Exclude<LightingCheckReason, null>, string> = {
  too_dark: "It's too dark. Please move to a brighter area.",
  too_bright: 'Lighting is too bright/washed out. Please reduce direct light or move away from strong backlight.',
  uneven: 'Lighting is uneven on your face. Please face a light source directly or reduce shadows from one side.',
  backlit: "You're backlit — try facing a window or light source instead of having it behind you.",
};

// classifyRegionOcclusionAdaptive()'s minStdDev per region — kept as
// separate tunable constants rather than one shared value, since each
// region's genuine (unoccluded) content has different typical local
// contrast (open mouth interior > closed lips/mouth > eyes/brow skin).
// Was 18 (pixel-analysis.ts's generic default, tuned around teeth/gum
// contrast) — lowered for tongue's smoother, more uniform surface.
const TONGUE_OCCLUSION_MIN_STD_DEV = 12;
const EYE_OCCLUSION_MIN_STD_DEV = 12;
const FACE_MOUTH_OCCLUSION_MIN_STD_DEV = 10;
// classifyRegionOcclusionAdaptive()'s maxLumaDiff — same starting value
// (its own default) for all three regions, sampled fresh each tick against
// a same-frame forehead patch rather than a fixed guessed skin tone.
// TEMPORARY — logs stdDev/lumaDiff/occluded for every region's occlusion
// check every tick, so a chip reading green under a real hand can be
// diagnosed against genuinely-visible coordinates instead of guesswork.
// Flip back to false once confirmed good.
const DEBUG_OCCLUSION_LOGGING = true;

// Starting estimate for "turned enough" — a fraction of interocular
// distance. Tune from DEBUG_EYE_DIRECTION_LOGGING's real numbers.
const MIN_YAW_OFFSET_RATIO = 0.15;
// Head ROLL (ear-to-shoulder tilt) — distinct from the yaw direction check
// above: a turned head is the whole point of Eye's left/right steps, but a
// rolled one isn't. Not a new number — mirrors teeth-capture-guidance.ts's
// already-tested MAX_TILT_DEGREES unchanged, applied to Face/Eye's
// headTiltDegrees() for the first time.
const MAX_HEAD_TILT_DEGREES = 10;
// TEMPORARY — logs the real numbers behind the Eye Assessment's per-step
// head-direction check (yaw/pitch ratios, thresholds, which way they were
// compared) so a wrong-direction false-accept/false-reject can be diagnosed
// from real values. Flip back to false once confirmed good.
const DEBUG_EYE_DIRECTION_LOGGING = true;

// Frame-to-frame "is this region actually being tracked, or is it stuck on
// an extrapolated guess" check — see region-motion.ts. Below this much
// reference (nose) movement over the window, the user's just holding
// still, which isn't suspicious on its own. Above it, a region moving less
// than this fraction of the reference's movement reads as frozen. Starting
// estimates, not live-tuned — see DEBUG_OCCLUSION_LOGGING output.
const MIN_REFERENCE_MOVEMENT_FOR_FROZEN_CHECK = 0.01;
const MAX_REGION_TO_REFERENCE_MOVEMENT_RATIO = 0.2;

// TEMPORARY — logs relevant blendshape category scores per region while
// testing occlusion, purely as diagnostic data (NOT used to gate capture
// yet). Blendshape scores are computed from the same face-mesh regression
// that already hallucinates plausible landmarks under occlusion, so they
// may not carry an independent confidence signal — this collects real
// numbers before deciding whether they're worth gating on.
const DEBUG_BLENDSHAPE_LOGGING = true;

// TEMPORARY — logs the eye-aspect ratio, blink count and window motion behind
// the Face Assessment's liveness gate. face-liveness.ts's
// EAR/motion thresholds are starting estimates, exactly like
// MIN_YAW_OFFSET_RATIO above, and need confirming against real-camera numbers:
// too strict an EAR pair nags a light blinker, too loose a motion floor lets a
// mounted photo through. Flip to true locally for that tuning pass; it must
// stay false in committed code.
const DEBUG_LIVENESS_LOGGING = false;

// TEMPORARY — mirrors DEBUG_LIVENESS_LOGGING above but for assessmentKind
// 'eye', which reuses the exact same LivenessTracker/eyeAspectRatio mechanism
// but was never tested against a turned (left/right) head pose. The
// open question this is meant to answer: does EAR read reliably during those
// turns, or does the same foreshortening that eyeSizeSymmetryRatio/
// noseYawOffsetRatio rely on to detect a turn also distort EAR enough to
// affect eyesOpen/awaiting_blink. Kept as its own flag (not shared with
// DEBUG_LIVENESS_LOGGING) so testing this doesn't also re-emit
// [face-liveness-debug] noise for an already-confirmed check. Flip back to
// false once confirmed good.
const DEBUG_EYE_LIVENESS_LOGGING = true;

// TEMPORARY — logs the raw brightness samples (overall/subject/border luma,
// left/right halves) behind evaluateLightingQuality's thresholds
// (minBrightness/maxBrightness/maxHalfDiff/maxBacklightDiff), which had no
// visibility at all before this — every other numeric-threshold check in
// this file already had a DEBUG_*_LOGGING flag except this one. Flip back to
// false once confirmed good.
const DEBUG_LIGHTING_LOGGING = true;

// Eye Assessment blur/sharpness check — reuses frame-quality.ts's
// evaluateFrameQuality() and its BLUR_VARIANCE_THRESHOLD (15) completely
// unchanged, the same function teeth-capture.tsx already relies on. Sampled
// on a downscaled square (matching teeth-capture.tsx's own QUALITY_SNAPSHOT_SIZE)
// so the threshold — tuned at that scale — actually applies at the scale it
// was validated for, rather than being reused against a differently-scaled
// frame. Same slow cadence as lighting: sharpness doesn't change tick-to-tick.
const QUALITY_SNAPSHOT_SIZE = 160;
const QUALITY_SNAPSHOT_INTERVAL_MS = 500;
// TEMPORARY — logs sharpness/isBlurry against frame-quality.ts's
// BLUR_VARIANCE_THRESHOLD, applied to Eye Assessment for the first time (was
// Teeth-only). The threshold itself isn't new, but this is its first use at
// Eye's actual capture distance/lighting/downscale pipeline, so confirm real
// numbers before trusting it to gate real users. Flip back to false once
// confirmed good.
const DEBUG_EYE_QUALITY_LOGGING = true;

/** Bounding box for the tongue-occlusion pixel check — padded around the
 * mouth's own tight bounding box (face-framing.ts's mouthBoundingBox(),
 * traced from just the two mouth corners + inner upper/lower lip points),
 * NOT the much larger mouth+jaw region: that larger box pulled in a lot of
 * chin/jaw skin, which is nearly as uniform as an actual occlusion and was
 * diluting the mouth interior's real contrast regardless of what was
 * actually happening inside the mouth. Padded down/out a bit since a
 * protruded tongue tip can extend past the lower-lip landmark itself. */
function tongueOcclusionBox(landmarks: FaceLandmark[]): NormalizedBox | null {
  const box = mouthBoundingBox(landmarks);
  if (!box) return null;
  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;
  return {
    xMin: Math.max(0, box.minX - width * 0.15),
    xMax: Math.min(1, box.maxX + width * 0.15),
    yMin: box.minY,
    yMax: Math.min(1, box.maxY + height * 0.5),
  };
}

/** Bounding box for the eye-occlusion pixel check — padded a bit around
 * face-framing.ts's eyeBoundingBox() so a hand resting just above/below the
 * eyes (not precisely on the landmark corners) is still caught. */
function eyeOcclusionBox(landmarks: FaceLandmark[]): NormalizedBox | null {
  const box = eyeBoundingBox(landmarks);
  if (!box) return null;
  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;
  return {
    xMin: Math.max(0, box.minX - width * 0.1),
    xMax: Math.min(1, box.maxX + width * 0.1),
    yMin: Math.max(0, box.minY - height * 0.5),
    yMax: Math.min(1, box.maxY + height * 0.5),
  };
}

/** Bounding box for the Face Assessment's mouth-occlusion pixel check —
 * padded a bit around face-framing.ts's mouthBoundingBox(). Unlike Tongue's
 * version, no extra downward padding: Face's mouth is expected closed, not
 * protruding a tongue past the lower-lip landmark. */
function faceMouthOcclusionBox(landmarks: FaceLandmark[]): NormalizedBox | null {
  const box = mouthBoundingBox(landmarks);
  if (!box) return null;
  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;
  return {
    xMin: Math.max(0, box.minX - width * 0.2),
    xMax: Math.min(1, box.maxX + width * 0.2),
    yMin: Math.max(0, box.minY - height * 0.2),
    yMax: Math.min(1, box.maxY + height * 0.2),
  };
}

function boxCenter(box: { minX: number; maxX: number; minY: number; maxY: number } | null): { x: number; y: number } | null {
  if (!box) return null;
  return { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
}

/** Draws the video down to a QUALITY_SNAPSHOT_SIZE-square canvas and reads it
 * back as a PixelFrame — byte-for-byte the same approach as
 * teeth-capture.tsx's captureDownscaledFrame(), so frame-quality.ts's
 * BLUR_VARIANCE_THRESHOLD (tuned at that exact scale) applies unchanged here
 * too, rather than being reused against a differently-scaled snapshot. */
function captureDownscaledQualityFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): PixelFrame | undefined {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return undefined;
  ctx.drawImage(video, 0, 0, QUALITY_SNAPSHOT_SIZE, QUALITY_SNAPSHOT_SIZE);
  const imageData = ctx.getImageData(0, 0, QUALITY_SNAPSHOT_SIZE, QUALITY_SNAPSHOT_SIZE);
  return { data: imageData.data, width: imageData.width, height: imageData.height };
}

/** Midpoint between two landmarks — used to place the scanning highlight's
 * cheek markers roughly on the cheek itself (FACE_LM has no dedicated cheek
 * indices) by averaging an eye-outer-corner point with the nearest mouth
 * corner. Null propagates if either input is missing. */
function midpoint(a: FaceLandmark | undefined, b: FaceLandmark | undefined): { x: number; y: number } | null {
  if (!a || !b) return null;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

// face-framing.ts's FaceBoundingBox ({minX,maxX,minY,maxY}) and
// pixel-analysis.ts's NormalizedBox ({xMin,xMax,yMin,yMax}) are the same
// shape under different field names — this bridges the two.
function toNormalizedBox(box: { minX: number; maxX: number; minY: number; maxY: number } | null): NormalizedBox | null {
  if (!box) return null;
  return { xMin: box.minX, xMax: box.maxX, yMin: box.minY, yMax: box.maxY };
}

type Blendshapes = ReturnType<FaceLandmarker['detectForVideo']>['faceBlendshapes'];

interface RegionVisibilityResult {
  /** Combined verdict: pixel check didn't flag occlusion AND the region
   * isn't suspiciously frozen relative to head motion. */
  visible: boolean;
  occlusion: AdaptiveOcclusionResult | null;
  frozen: boolean;
}

/** Combines the adaptive pixel-occlusion check with the frame-to-frame
 * frozen-region check for one region — shared by Face's eyes/mouth,
 * Tongue's mouth, and Eye Assessment's eyes, so the combination rule lives
 * in exactly one place. Always updates `motionTracker` (even if the pixel
 * check is skipped), since the motion history needs to stay continuous
 * tick-to-tick regardless of whether a pixel snapshot was available. */
function evaluateRegionVisibility(
  imageData: ImageData | null,
  targetBox: NormalizedBox | null,
  referenceBox: NormalizedBox | null,
  minStdDev: number,
  motionTracker: RegionMotionTracker,
  regionCentroid: { x: number; y: number } | null,
  noseCentroid: { x: number; y: number } | null,
): RegionVisibilityResult {
  let occlusion: AdaptiveOcclusionResult | null = null;
  let pixelVisible = false;
  if (imageData && targetBox && referenceBox) {
    occlusion = classifyRegionOcclusionAdaptive(imageData, targetBox, referenceBox, { minStdDev });
    pixelVisible = !occlusion.occluded;
  }

  motionTracker.update(regionCentroid, noseCentroid);
  const frozen = motionTracker.isSuspiciouslyFrozen(MIN_REFERENCE_MOVEMENT_FOR_FROZEN_CHECK, MAX_REGION_TO_REFERENCE_MOVEMENT_RATIO);

  return { visible: pixelVisible && !frozen, occlusion, frozen };
}

/** Extracts just the categories whose name starts with one of `prefixes`
 * (e.g. 'eye', 'mouth', 'jaw') — diagnostic-only, see DEBUG_BLENDSHAPE_LOGGING. */
function relevantBlendshapes(blendshapes: Blendshapes | undefined, prefixes: string[]): Record<string, number> {
  const categories = blendshapes?.[0]?.categories ?? [];
  const result: Record<string, number> = {};
  for (const category of categories) {
    if (prefixes.some((prefix) => category.categoryName.toLowerCase().startsWith(prefix))) {
      result[category.categoryName] = category.score;
    }
  }
  return result;
}

export function FaceMeshCapture({
  isSubmitting,
  onCapture,
  promptText,
  requiredRegions,
  assessmentKind,
  requiredHeadDirection,
  holdMs,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pixelCanvasRef = useRef<HTMLCanvasElement>(null);
  const lightingCanvasRef = useRef<HTMLCanvasElement>(null);
  // Eye Assessment blur/sharpness check only — see DEBUG_EYE_QUALITY_LOGGING.
  const qualitySnapshotCanvasRef = useRef<HTMLCanvasElement>(null);
  const lastQualityAtRef = useRef(-1);
  const qualityFrameRef = useRef<PixelFrame | undefined>(undefined);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const lastInferAtRef = useRef(-1);
  const lastTimestampRef = useRef(-1);
  const lastLightingAtRef = useRef(-1);
  const lightingRef = useRef<{ ok: boolean; reason: LightingCheckReason }>({ ok: true, reason: null });
  // Last face box the inference tick found (converted to lighting-quality's
  // {xMin,xMax,yMin,yMax} shape, distinct from face-framing's {minX,maxX,...}
  // one) — the lighting sample runs on its own slower cadence (see
  // LIGHTING_INTERVAL_MS) and reuses whichever face box was most recently
  // detected rather than re-running detection itself.
  const lastFaceBoxRef = useRef<NormalizedBox | null>(null);
  const voiceStateRef = useRef<VoiceGuidanceState>(INITIAL_VOICE_GUIDANCE_STATE);
  const autoCaptureFiredRef = useRef(false);
  const justCapturedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // When the visible capture countdown (assessmentKind 'face' only) started,
  // in the same `performance.now()` timebase as every other timestamp in the
  // inference loop — null while not counting down. See CAPTURE_COUNTDOWN_SECONDS.
  const captureCountdownStartRef = useRef<number | null>(null);
  // Frame-to-frame "is this region actually moving with the head, or is it
  // stuck" trackers (region-motion.ts) — one per region this screen might
  // check, all compared against the nose tip as the stable reference.
  const eyesMotionRef = useRef(new RegionMotionTracker());
  const mouthMotionRef = useRef(new RegionMotionTracker());
  const jawMotionRef = useRef(new RegionMotionTracker());
  // Blink + frame-change liveness (§2, extended to Eye). Consulted
  // for assessmentKind 'face' and 'eye' (not yet 'tongue' — see trackedRegions
  // memo), held here (not inside the loop effect) so its blink history
  // survives the effect re-running.
  const livenessRef = useRef(new LivenessTracker());

  // 'faceSize'/'lightingOk'/'singleFace' always gate capture, plus whichever
  // kind-specific synthetic checks this screen needs, on top of the caller's
  // requiredRegions pills.
  const trackedRegions = useMemo(() => {
    const extra =
      assessmentKind === 'face'
        ? // 'singleFace' below is safe to apply everywhere by contrast — a
          // second person in frame is never valid for any of these captures.
          ['frontal', 'notClipped', 'livenessOk', 'eyesOpen']
        : assessmentKind === 'tongue'
          ? // 'livenessOk'/'eyesOpen' still excluded here — Tongue's mouth-open
            // shot needs its own tuning pass (does blinking interact oddly
            // with holding the mouth open?) before this extends further.
            ['frontal', 'mouthOpenOk', 'notOccluded']
          : assessmentKind === 'eye'
            ? // Extended to Eye from Face-only (was scoped to Face) —
              // reuses the exact same LivenessTracker/eyeAspectRatio mechanism,
              // no new logic. Each of the 3 direction steps is its own
              // FaceMeshCapture instance (eye-assessment-flow.tsx remounts on
              // `key={direction}`), so livenessRef — and its 12s blink-recency
              // window — resets per step: every step independently needs its
              // own fresh blink, by design, not carried over from a prior step.
              // notClipped/headTiltOk/notBlurry added in this pass — all three
              // apply regardless of which direction step this is, unlike
              // eyeSizeSymmetryOk/directionOk which are step-specific.
              (requiredHeadDirection ?? 'center') === 'center'
              ? ['eyeSizeSymmetryOk', 'notOccluded', 'notClipped', 'headTiltOk', 'notBlurry', 'livenessOk', 'eyesOpen']
              : ['directionOk', 'notOccluded', 'notClipped', 'headTiltOk', 'notBlurry', 'livenessOk', 'eyesOpen']
            : assessmentKind === 'skin'
              ? // No eyes/mouth/jaw requirement — a skin patch isn't a specific
                // facial feature, so this only gates the checks any clear,
                // well-lit, in-focus photo of a live single person needs.
                ['notClipped', 'notBlurry', 'livenessOk', 'eyesOpen']
              : [];
    return [...requiredRegions, 'faceSize', 'lightingOk', 'singleFace', ...extra];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requiredRegions.join(','), assessmentKind, requiredHeadDirection]);
  const gateRef = useRef(new CaptureGateTracker(trackedRegions, { holdMs: holdMs ?? DEFAULT_HOLD_MS }));

  const [cameraError, setCameraError] = useState<MediaAccessError | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [faceReady, setFaceReady] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [isReadyToCapture, setIsReadyToCapture] = useState(false);
  const [rejectMessage, setRejectMessage] = useState<string | null>(null);
  const [justCaptured, setJustCaptured] = useState(false);
  // Whether the most recent inference tick found a face at all — distinct
  // from `faceReady` (the model finished loading). Drives the premium scan
  // UI's guide state and the landmark overlay's fade in/out.
  const [hasFace, setHasFace] = useState(false);
  // Face Assessment's visible "Capturing in 3 2 1" — null while not counting
  // down, see captureCountdownStartRef/CAPTURE_COUNTDOWN_SECONDS.
  const [captureCountdown, setCaptureCountdown] = useState<number | null>(null);
  // Real landmark positions for the scanning-highlight visual (assessmentKind
  // 'face' only) — a handful of {x,y} points, not the full landmark array,
  // see face-scan-highlights.tsx.
  const [scanAnchors, setScanAnchors] = useState<ScanAnchors | null>(null);
  // Which SCAN_CATEGORIES entry the highlight is currently pointing at —
  // cycles on a plain interval since it's a purely atmospheric loop, not
  // something that needs to stay in lockstep with the inference loop.
  const [scanCategoryIndex, setScanCategoryIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setScanCategoryIndex((index) => (index + 1) % SCAN_CATEGORIES.length), SCAN_CATEGORY_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    gateRef.current = new CaptureGateTracker(trackedRegions, { holdMs: holdMs ?? DEFAULT_HOLD_MS });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackedRegions.join(','), holdMs]);

  useEffect(() => {
    let cancelled = false;

    speakGuidance(voiceStateRef, 'Please allow camera access.', performance.now());
    requestCameraStream()
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraReady(true);
      })
      .catch((error: unknown) => {
        if (!cancelled) setCameraError(cameraErrorMessage(error));
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      // Silence any in-flight or queued cue on the way out — speechSynthesis
      // is a global that outlives this component, so without this a cue
      // spoken just as the user navigates away keeps talking over the next
      // screen (see squats-test.tsx's voice.stop() for the same fix on the
      // useSpeechCue-hook path).
      stopSpeaking();
    };
  }, []);

  useEffect(() => {
    if (cameraReady && faceReady && !capturedBlob) {
      speakGuidance(voiceStateRef, promptText ?? 'Position your face inside the circle', performance.now());
    }
  }, [cameraReady, faceReady, capturedBlob, promptText]);

  useEffect(
    () => () => {
      if (justCapturedTimeoutRef.current) clearTimeout(justCapturedTimeoutRef.current);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    getFaceLandmarker()
      .then((landmarker) => {
        if (cancelled) return;
        landmarkerRef.current = landmarker;
        setFaceReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setCameraError({
            kind: 'unavailable',
            message: 'Could not load the face-tracking model. Try reloading the page.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCapture = useCallback(() => {
    // TEMPORARY — proves which path actually invoked this call (the manual
    // button vs. maybeAutoCapture vs. anything else) from a real repro,
    // instead of static code reading. Remove once the bug is confirmed fixed.
    console.log('CAPTURE CALLED FROM:', new Error().stack);

    // Marks the auto-capture hold as "spent" regardless of what triggered
    // this call (the button or the gate firing automatically), so a step()
    // tick between this call and capturedBlob updating can't also trigger a
    // second, overlapping capture.
    autoCaptureFiredRef.current = true;

    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setCapturedBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
        streamRef.current?.getTracks().forEach((t) => t.stop());

        speak('Image captured successfully. Analyzing…');
        setJustCaptured(true);
        if (justCapturedTimeoutRef.current) clearTimeout(justCapturedTimeoutRef.current);
        justCapturedTimeoutRef.current = setTimeout(() => setJustCaptured(false), JUST_CAPTURED_DURATION_MS);
      },
      'image/jpeg',
      0.9,
    );
  }, []);

  // Live face-mesh + capture-gate loop. requestAnimationFrame (not
  // setInterval) because detectForVideo requires a monotonically increasing
  // timestamp and rAF auto-pauses on a backgrounded tab.
  useEffect(() => {
    if (!cameraReady || !faceReady || capturedBlob) return;

    let stopped = false;

    const step = () => {
      if (stopped) return;
      const video = videoRef.current;
      const landmarker = landmarkerRef.current;

      // readyState >= HAVE_CURRENT_DATA (2) — videoWidth can already be set
      // from the stream's track settings before the first frame has
      // actually decoded, and calling detectForVideo before then can throw.
      if (video && landmarker && video.videoWidth > 0 && video.readyState >= 2) {
        const now = performance.now();

        if (now - lastLightingAtRef.current >= LIGHTING_INTERVAL_MS) {
          lastLightingAtRef.current = now;
          const lightingCanvas = lightingCanvasRef.current;
          if (lightingCanvas) {
            const imageData = sampleLightingImageData(video, lightingCanvas);
            if (imageData) {
              lightingRef.current = evaluateLightingQuality(imageData, lastFaceBoxRef.current);
              if (DEBUG_LIGHTING_LOGGING) {
                console.log('[lighting-debug]', {
                  assessmentKind,
                  result: lightingRef.current,
                  ...sampleLightingDebugMetrics(imageData, lastFaceBoxRef.current),
                  thresholds: {
                    minBrightness: 70,
                    maxBrightness: 220,
                    maxHalfDiff: 35,
                    maxBacklightDiff: 75,
                    minBackgroundBrightnessForBacklight: 140,
                  },
                });
              }
            }
          }
        }

        const dueForInference =
          now - lastInferAtRef.current >= INFER_INTERVAL_MS && video.currentTime !== lastVideoTimeRef.current && now > lastTimestampRef.current;

        if (dueForInference) {
          lastVideoTimeRef.current = video.currentTime;
          lastInferAtRef.current = now;
          lastTimestampRef.current = now;

          let landmarks: ReturnType<FaceLandmarker['detectForVideo']>['faceLandmarks'][number] | undefined;
          let allFaces: ReturnType<FaceLandmarker['detectForVideo']>['faceLandmarks'] = [];
          let blendshapes: Blendshapes | undefined;
          try {
            const result = landmarker.detectForVideo(video, now);
            allFaces = result.faceLandmarks;
            landmarks = result.faceLandmarks[0];
            blendshapes = result.faceBlendshapes;
          } catch {
            // A single bad frame (e.g. the underlying WASM graph momentarily
            // out of sync with the video) shouldn't crash the whole screen —
            // skip this tick and let the next one retry.
            rafRef.current = requestAnimationFrame(step);
            return;
          }
          const foundFace = Boolean(landmarks);
          setHasFace((prev) => (prev === foundFace ? prev : foundFace));

          // The loader requests numFaces: 2 precisely so "someone else is in
          // frame" is distinguishable from "we only ever look for one" — this
          // is where that second detection is finally acted on.
          const presence = classifyFacePresence(allFaces);
          const raw = classifyFaceFraming(landmarks);
          const widthRatio = faceWidthRatio(landmarks);
          const faceBox = faceBoundingBox(landmarks);
          lastFaceBoxRef.current = faceBox
            ? { xMin: faceBox.minX, xMax: faceBox.maxX, yMin: faceBox.minY, yMax: faceBox.maxY }
            : null;
          // Reference point for the frozen-region motion check — the nose
          // tip moves whenever the head moves at all, regardless of which
          // other region is (or isn't) genuinely tracking.
          const noseCentroid = landmarks?.[FACE_LM.nose[0]] ?? null;

          const regions: Record<string, boolean> = {
            eyes: raw.eyes,
            eyebrows: raw.eyebrows,
            mouth: raw.mouth,
            jaw: raw.jaw,
            faceSize: raw.faceSizeOk,
            lightingOk: lightingRef.current.ok,
            singleFace: presence === 'single',
            // Not a required region — purely a smoothing channel so a
            // single noisy lighting sample can't flash the "backlit"
            // message (see the message resolution below).
            lightingBacklit: lightingRef.current.reason === 'backlit',
          };

          let reason: FaceRejectReason = null;

          // Pixel sampling (occlusion) needs an actual frame snapshot, drawn
          // once per inference tick into a hidden canvas — only for the
          // kind that needs it.
          const canvas = pixelCanvasRef.current;
          let imageData: ImageData | null = null;
          if ((assessmentKind === 'tongue' || assessmentKind === 'eye' || assessmentKind === 'face') && canvas && landmarks) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const pctx = canvas.getContext('2d');
            if (pctx) {
              pctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              imageData = pctx.getImageData(0, 0, canvas.width, canvas.height);
            }
          }

          // Real anchor points for the scanning-highlight visual (see
          // face-scan-highlights.tsx) — purely cosmetic positioning, not fed
          // into any pass/fail logic. Computed for every kind (not just
          // Face) since these are just facial-skin landmark positions,
          // available regardless of which checks a given kind actually gates.
          const newScanAnchors: ScanAnchors | null = landmarks
            ? {
                underEyeLeft: landmarks[FACE_LM.leftEye[3]] ?? null,
                underEyeRight: landmarks[FACE_LM.rightEye[3]] ?? null,
                cheekLeft: midpoint(landmarks[FACE_LM.leftEye[0]], landmarks[FACE_LM.mouth[0]]),
                cheekRight: midpoint(landmarks[FACE_LM.rightEye[0]], landmarks[FACE_LM.mouth[1]]),
                forehead: boxCenter(foreheadReferenceBox(landmarks)),
                noseTip: landmarks[FACE_LM.nose[0]] ?? null,
              }
            : null;
          setScanAnchors(newScanAnchors);

          if (assessmentKind === 'face') {
            // raw.eyes/raw.mouth (classifyFaceFraming) only check that the
            // landmarks sit inside the frame margin — they say nothing
            // about whether those landmarks reflect a real, visible
            // eye/mouth. MediaPipe's dense face mesh still regresses
            // plausible-looking coordinates for a covered region from the
            // rest of the visible face, so landmark presence alone can't
            // catch a hand/hair occlusion — hence the combined pixel +
            // motion check below, folded into the SAME 'eyes'/'mouth'
            // regions so the visible checklist chips (not just an
            // invisible gate) reflect the real state.
            const foreheadBox = toNormalizedBox(foreheadReferenceBox(landmarks));

            const eyesResult = evaluateRegionVisibility(
              imageData,
              eyeOcclusionBox(landmarks ?? []),
              foreheadBox,
              EYE_OCCLUSION_MIN_STD_DEV,
              eyesMotionRef.current,
              boxCenter(eyeBoundingBox(landmarks)),
              noseCentroid,
            );
            const mouthResult = evaluateRegionVisibility(
              imageData,
              faceMouthOcclusionBox(landmarks ?? []),
              foreheadBox,
              FACE_MOUTH_OCCLUSION_MIN_STD_DEV,
              mouthMotionRef.current,
              boxCenter(mouthBoundingBox(landmarks)),
              noseCentroid,
            );

            // Liveness — landmark geometry alone can't tell a
            // real person from a printed photo or a screen: the face mesh
            // regresses perfectly plausible landmarks off either. A blink
            // that actually completes (close THEN reopen), plus the frame
            // genuinely changing tick-to-tick, are the two signals a still
            // image can't fake. Updated every tick so the rolling windows
            // stay continuous.
            const liveness = livenessRef.current.update(landmarks, now);
            regions.livenessOk = liveness.isLive;
            // Separate from livenessOk on purpose: livenessOk stays true for
            // the whole 12s blink-recency window, so without this the capture
            // could land on the very blink it just asked for. Gated through
            // the same 8-sample/70% majority as every other region, so a
            // normal 1-2 tick blink doesn't reset the hold — a sustained
            // squint or shut eyes does.
            regions.eyesOpen = liveness.eyesOpen;

            if (DEBUG_OCCLUSION_LOGGING) {
              console.log('[face-occlusion-debug]', {
                eyes: { clippingCheck: raw.eyes, ...eyesResult },
                mouth: { clippingCheck: raw.mouth, ...mouthResult },
              });
            }
            if (DEBUG_LIVENESS_LOGGING) {
              console.log('[face-liveness-debug]', {
                presence,
                eyeAspectRatio: eyeAspectRatio(landmarks),
                ...liveness,
                // Adds the internal arm state and motion-window fill that
                // LivenessResult doesn't carry — both matter when reading
                // these logs to tune the EAR pair and the motion floor.
                tracker: livenessRef.current.getDebugSnapshot(),
              });
            }
            if (DEBUG_BLENDSHAPE_LOGGING) {
              console.log('[face-blendshape-debug]', relevantBlendshapes(blendshapes, ['eye', 'mouth']));
            }

            const eyesOk = raw.eyes && eyesResult.visible;
            const mouthOk = raw.mouth && mouthResult.visible;
            regions.eyes = eyesOk;
            regions.mouth = mouthOk;

            const frontal = eyesOk && raw.nose && mouthOk;
            regions.frontal = frontal;
            regions.notClipped = raw.notClipped;

            if (!raw.eyes || !raw.nose || !raw.mouth) reason = 'frontal';
            else if (!eyesResult.visible || !mouthResult.visible) reason = 'occluded';
            else if (!raw.faceSizeOk) reason = widthRatio !== null && widthRatio < 0.25 ? 'faceTooSmall' : 'faceTooBig';
            else if (!raw.notClipped) reason = 'clipped';
            // Liveness comes last of the face-branch reasons on purpose: ask
            // the user to frame and unblock their face before asking them to
            // blink, since a badly-framed face can't produce a usable EAR
            // anyway. 'no_face' is already covered by 'frontal' above.
            else if (liveness.reason === 'static_frame') reason = 'notLive';
            else if (liveness.reason === 'awaiting_blink') reason = 'awaitingBlink';
          } else if (assessmentKind === 'tongue') {
            const mouthOpenOk = classifyMouthOpenness(landmarks, MIN_MOUTH_OPEN_RATIO);
            regions.mouthOpenOk = mouthOpenOk;

            // The pixel check only runs (and only matters) once the mouth
            // is actually claimed open — a closed mouth is naturally
            // low-contrast too and isn't "occluded", and mouthOpenOk
            // already blocks capture on its own in that case. The motion
            // tracker still updates every tick regardless (mouthBox=null
            // just skips the pixel portion), so it has a real history by
            // the time the mouth opens. Fails safe (reject) once open if
            // the pixel check couldn't actually run for any reason.
            const mouthBox = mouthOpenOk ? tongueOcclusionBox(landmarks ?? []) : null;
            const mouthResult = evaluateRegionVisibility(
              imageData,
              mouthBox,
              toNormalizedBox(foreheadReferenceBox(landmarks)),
              TONGUE_OCCLUSION_MIN_STD_DEV,
              mouthMotionRef.current,
              boxCenter(mouthBoundingBox(landmarks)),
              noseCentroid,
            );
            const notOccluded = mouthOpenOk ? mouthResult.visible : true;
            regions.notOccluded = notOccluded;
            regions.mouth = raw.mouth && notOccluded;

            // Jaw has no useful pixel occlusion signal — jaw skin and a
            // hand resting on/under it are both just "skin", so the
            // adaptive check's "matches the forehead reference" condition
            // can't tell them apart. Motion is the only signal that fits:
            // a hand covering the jaw tends not to move exactly with real
            // jaw/head motion the way the jaw itself does.
            const jawCentroid = boxCenter(jawBoundingBox(landmarks));
            jawMotionRef.current.update(jawCentroid, noseCentroid);
            const jawFrozen = jawMotionRef.current.isSuspiciouslyFrozen(
              MIN_REFERENCE_MOVEMENT_FOR_FROZEN_CHECK,
              MAX_REGION_TO_REFERENCE_MOVEMENT_RATIO,
            );
            regions.jaw = raw.jaw && !jawFrozen;

            const frontal = raw.eyes && raw.nose && regions.mouth;
            regions.frontal = frontal;

            if (DEBUG_OCCLUSION_LOGGING) {
              console.log('[tongue-occlusion-debug]', {
                mouthOpenRatio: mouthOpenRatio(landmarks),
                mouthOpenOk,
                mouth: { clippingCheck: raw.mouth, ...mouthResult },
                jaw: { clippingCheck: raw.jaw, frozen: jawFrozen, motionDebug: jawMotionRef.current.getDebugSnapshot() },
              });
            }
            if (DEBUG_BLENDSHAPE_LOGGING) {
              console.log('[tongue-blendshape-debug]', relevantBlendshapes(blendshapes, ['mouth', 'jaw', 'tongue']));
            }

            if (!raw.eyes || !raw.nose || !raw.mouth) reason = 'frontal';
            else if (!mouthOpenOk) reason = 'mouthNotOpen';
            else if (!mouthResult.visible) reason = 'occluded';
            else if (!raw.jaw || jawFrozen) reason = 'occluded';
            else if (!raw.faceSizeOk) reason = 'faceSize';
          } else if (assessmentKind === 'eye') {
            const direction = requiredHeadDirection ?? 'center';

            // Occlusion applies to every step, not just center — a hand
            // over the eyes is invalid regardless of which direction was
            // requested, and landmark presence alone doesn't catch it (a
            // dense face-mesh model can still emit plausible-looking
            // landmarks under partial occlusion). Folded into the visible
            // 'eyes' region (not just an invisible gate) so the checklist
            // chip itself reflects the real state, same as Face's eyes/mouth.
            const eyesResult = evaluateRegionVisibility(
              imageData,
              eyeOcclusionBox(landmarks ?? []),
              toNormalizedBox(foreheadReferenceBox(landmarks)),
              EYE_OCCLUSION_MIN_STD_DEV,
              eyesMotionRef.current,
              boxCenter(eyeBoundingBox(landmarks)),
              noseCentroid,
            );
            const notOccluded = eyesResult.visible;
            regions.notOccluded = notOccluded;
            regions.eyes = raw.eyes && notOccluded;
            // Whole-face clipping (forehead/chin/ears at the frame edge) —
            // classifyFaceFraming already computes this for every kind, but it
            // was only ever wired into Face's trackedRegions. Eyes-in-frame
            // and eyeSizeSymmetry/direction don't catch a clipped forehead or
            // jaw on their own.
            regions.notClipped = raw.notClipped;

            // Head ROLL (ear-to-shoulder tilt) — distinct from the yaw
            // direction check below: a turned head is the point of the
            // left/right steps, a rolled one isn't. Reuses
            // teeth-capture-guidance.ts's already-tested MAX_TILT_DEGREES
            // value (as MAX_HEAD_TILT_DEGREES) unchanged.
            const headTiltDeg = headTiltDegrees(landmarks);
            const headTiltOk = Math.abs(headTiltDeg) <= MAX_HEAD_TILT_DEGREES;
            regions.headTiltOk = headTiltOk;

            // Blur/sharpness — reuses frame-quality.ts's evaluateFrameQuality()
            // unchanged, same downscaled-160x160-snapshot approach
            // teeth-capture.tsx already relies on, sampled on the same slow
            // cadence as lighting (sharpness doesn't change tick-to-tick).
            if (qualitySnapshotCanvasRef.current && now - lastQualityAtRef.current >= QUALITY_SNAPSHOT_INTERVAL_MS) {
              lastQualityAtRef.current = now;
              qualityFrameRef.current = captureDownscaledQualityFrame(video, qualitySnapshotCanvasRef.current);
            }
            const quality = qualityFrameRef.current ? evaluateFrameQuality(qualityFrameRef.current) : null;
            const notBlurry = quality ? !quality.isBlurry : true;
            regions.notBlurry = notBlurry;

            if (DEBUG_BLENDSHAPE_LOGGING) {
              console.log('[eye-blendshape-debug]', relevantBlendshapes(blendshapes, ['eye']));
            }

            let directionOk: boolean;
            const yaw = noseYawOffsetRatio(landmarks);
            if (direction === 'center') {
              directionOk = classifyEyeSizeSymmetry(landmarks);
              regions.eyeSizeSymmetryOk = directionOk;
            } else if (direction === 'left') {
              directionOk = yaw !== null && yaw >= MIN_YAW_OFFSET_RATIO;
              regions.directionOk = directionOk;
            } else {
              directionOk = yaw !== null && yaw <= -MIN_YAW_OFFSET_RATIO;
              regions.directionOk = directionOk;
            }

            if (DEBUG_EYE_DIRECTION_LOGGING) {
              console.log('[eye-direction-debug]', {
                direction,
                yaw,
                minYawOffsetRatio: MIN_YAW_OFFSET_RATIO,
                directionOk,
                // Only meaningful for direction === 'center' (classifyEyeSizeSymmetry's
                // input) — included every tick regardless so the min/max ratio
                // thresholds (face-framing.ts's EYE_SIZE_SYMMETRY_MIN_RATIO/MAX_RATIO,
                // currently 0.7/1.3) can be tuned from real numbers too.
                eyeSizeSymmetryRatio: eyeSizeSymmetryRatio(landmarks),
                eyeSizeSymmetryMinRatio: 0.7,
                eyeSizeSymmetryMaxRatio: 1.3,
                // faceSize's own threshold (face-framing.ts's minWidthRatio/maxWidthRatio,
                // currently 0.25/0.85) — not logged anywhere else for assessmentKind 'eye'.
                faceWidthRatio: widthRatio,
                faceSizeOk: raw.faceSizeOk,
                minWidthRatio: 0.25,
                maxWidthRatio: 0.85,
                headTiltDegrees: headTiltDeg,
                maxHeadTiltDegrees: MAX_HEAD_TILT_DEGREES,
                headTiltOk,
              });
            }
            if (DEBUG_OCCLUSION_LOGGING) {
              console.log('[eye-occlusion-debug]', { clippingCheck: raw.eyes, notClipped: raw.notClipped, ...eyesResult });
            }
            if (DEBUG_EYE_QUALITY_LOGGING) {
              console.log('[eye-quality-debug]', {
                sharpness: quality?.sharpness ?? null,
                // frame-quality.ts's BLUR_VARIANCE_THRESHOLD isn't exported —
                // mirrored here as a literal, same pattern as this file's own
                // lighting-debug log mirroring lighting-quality.ts's thresholds.
                blurVarianceThreshold: 15,
                isBlurry: quality?.isBlurry ?? null,
                notBlurry,
                hasSample: Boolean(quality),
              });
            }

            // Liveness (extended from Face's §2 — same LivenessTracker/
            // eyeAspectRatio, no new logic). Updated every tick regardless of
            // direction so the rolling windows stay continuous across this
            // step's ticks — livenessRef itself is fresh per step (see the
            // trackedRegions memo above), so this can't inherit a blink from a
            // prior direction.
            const liveness = livenessRef.current.update(landmarks, now);
            regions.livenessOk = liveness.isLive;
            regions.eyesOpen = liveness.eyesOpen;

            if (DEBUG_EYE_LIVENESS_LOGGING) {
              console.log('[eye-liveness-debug]', {
                direction,
                eyeAspectRatio: eyeAspectRatio(landmarks),
                ...liveness,
                tracker: livenessRef.current.getDebugSnapshot(),
              });
            }

            // !raw.eyes checked first, distinctly from !notOccluded: raw.eyes
            // is the landmark-in-frame-margin check (face-framing.ts's
            // regionInFrame), notOccluded is the pixel/motion occlusion check
            // — they can disagree (eyes just outside the margin but not
            // pixel-occluded), and previously only notOccluded fed `reason`,
            // so that case could leave regions.eyes false (capture correctly
            // blocked) with reason falling through to null if direction/
            // faceSize/liveness all happened to still pass — a disabled
            // button with no banner explaining why.
            if (!raw.eyes) reason = 'eyesOutOfFrame';
            else if (!notOccluded) reason = 'faceBlocked';
            else if (!raw.notClipped) reason = 'clipped';
            else if (!headTiltOk) reason = 'headTilted';
            else if (!directionOk) {
              reason = direction === 'center' ? 'eyeSymmetry' : direction === 'left' ? 'turnLeftMore' : 'turnRightMore';
            } else if (!raw.faceSizeOk) reason = 'faceSize';
            else if (!notBlurry) reason = 'blurry';
            // Liveness comes last, same priority rationale as Face's own
            // cascade: frame and unblock the shot before asking for a blink.
            // 'no_face' is already covered by 'eyesOutOfFrame'/the direction
            // checks above (yaw/pitch read null with no landmarks).
            else if (liveness.reason === 'static_frame') reason = 'notLive';
            else if (liveness.reason === 'awaiting_blink') reason = 'awaitingBlink';
          } else if (assessmentKind === 'skin') {
            // No eyes/mouth/jaw requirement — a skin patch isn't a specific
            // facial feature — so this only gates the checks any clear,
            // well-lit, in-focus photo of a live single person already needs
            // elsewhere in this file. Deliberately does NOT attempt an
            // "is this patch of skin occluded" pixel heuristic:
            // pixel-analysis.ts's adaptive occlusion check is built to flag a
            // region that looks like plain skin when it's SUPPOSED to look
            // like an eye/mouth — for a region that's supposed to look like
            // skin, that check is meaningless, and nothing here has been
            // tuned against real camera data for that question.
            regions.notClipped = raw.notClipped;

            if (qualitySnapshotCanvasRef.current && now - lastQualityAtRef.current >= QUALITY_SNAPSHOT_INTERVAL_MS) {
              lastQualityAtRef.current = now;
              qualityFrameRef.current = captureDownscaledQualityFrame(video, qualitySnapshotCanvasRef.current);
            }
            const quality = qualityFrameRef.current ? evaluateFrameQuality(qualityFrameRef.current) : null;
            const notBlurry = quality ? !quality.isBlurry : true;
            regions.notBlurry = notBlurry;

            const liveness = livenessRef.current.update(landmarks, now);
            regions.livenessOk = liveness.isLive;
            regions.eyesOpen = liveness.eyesOpen;

            if (!landmarks) reason = 'frontal';
            else if (!raw.faceSizeOk) reason = widthRatio !== null && widthRatio < 0.25 ? 'faceTooSmall' : 'faceTooBig';
            else if (!raw.notClipped) reason = 'clipped';
            else if (!notBlurry) reason = 'blurry';
            else if (liveness.reason === 'static_frame') reason = 'notLive';
            else if (liveness.reason === 'awaiting_blink') reason = 'awaitingBlink';
          } else if (!raw.faceSizeOk) {
            reason = 'faceSize';
          }

          // Outranks every kind-specific reason: which of two faces the rest
          // of the checks were even evaluated against is undefined, so
          // "you're not alone in frame" is the only honest message to show
          // Applied for every assessmentKind — a second
          // person is never valid for face, eye or tongue capture.
          if (presence === 'multiple') reason = 'multipleFaces';

          const gate = gateRef.current.update(regions, now);

          setConfirmed(gate.confirmed);
          setIsReadyToCapture(gate.isReadyToCapture);
          // Lighting takes priority over any landmark-based reason — bad
          // lighting is usually the root cause of bad landmark detection
          // anyway. Suppressed once the smoothed gate says capture is ready,
          // so the banner and the enabled button can never contradict each
          // other. "backlit" specifically is held to the same 8-sample/70%
          // majority as everything else before it's shown — a single
          // bright/dark outlier lighting sample shouldn't flash that message.
          const lightingReason =
            lightingRef.current.reason === 'backlit' && !gate.confirmed.lightingBacklit ? null : lightingRef.current.reason;
          // …except 'multipleFaces', which outranks even lighting: no other
          // message is actionable while a second person is in frame.
          const message =
            reason === 'multipleFaces'
              ? REJECT_MESSAGES.multipleFaces
              : !lightingRef.current.ok && lightingReason
                ? LIGHTING_MESSAGES[lightingReason]
                : reason
                  ? REJECT_MESSAGES[reason]
                  : null;
          setRejectMessage(gate.isReadyToCapture ? null : message);
          const spokenMessage = gate.isReadyToCapture ? READY_MESSAGE : message;
          if (spokenMessage) speakGuidance(voiceStateRef, spokenMessage, now);
          // Fires exactly once, on the tick auto-capture is ABOUT to trigger
          // (before autoCaptureFiredRef flips) — so if a bad frame ever gets
          // captured again, this log shows definitively whether every
          // required region genuinely read true (a threshold/check problem)
          // or the trigger fired despite something reading false (a gating
          // problem in maybeAutoCapture/CaptureGateTracker itself).
          if (gate.isReadyToCapture && !autoCaptureFiredRef.current) {
            console.log('[auto-capture-about-to-fire]', {
              assessmentKind,
              requiredHeadDirection,
              regions,
              confirmed: gate.confirmed,
              allRequiredConfirmed: gate.allRequiredConfirmed,
              requiredRegionsTracked: trackedRegions,
            });
          }
          if (assessmentKind === 'face' || assessmentKind === 'eye' || assessmentKind === 'skin') {
            // Visible 3-2-1 countdown instead of an instant capture — see
            // CAPTURE_COUNTDOWN_SECONDS. Timed off `now` (this same tick's
            // timestamp) rather than a separate setInterval so it shares the
            // inference loop's own pause/resume behavior. Extended to Eye and
            // Skin so each gets the same "about to capture" warning Face
            // gets, rather than firing the instant the gate clears. Tongue
            // still captures instantly via maybeAutoCapture() below — unchanged.
            if (gate.isReadyToCapture) {
              if (captureCountdownStartRef.current === null) captureCountdownStartRef.current = now;
              const elapsedMs = now - captureCountdownStartRef.current;
              const remaining = Math.max(0, CAPTURE_COUNTDOWN_SECONDS - Math.floor(elapsedMs / 1000));
              setCaptureCountdown((prev) => (prev === remaining ? prev : remaining));
              if (elapsedMs >= CAPTURE_COUNTDOWN_SECONDS * 1000 && !autoCaptureFiredRef.current) {
                autoCaptureFiredRef.current = true;
                handleCapture();
              }
            } else {
              captureCountdownStartRef.current = null;
              autoCaptureFiredRef.current = false;
              setCaptureCountdown((prev) => (prev === null ? prev : null));
            }
          } else {
            maybeAutoCapture(autoCaptureFiredRef, gate.isReadyToCapture, handleCapture);
          }
        }
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      stopped = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [cameraReady, faceReady, capturedBlob, assessmentKind, requiredHeadDirection, handleCapture, trackedRegions]);

  const handleRetake = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setCapturedBlob(null);
    setJustCaptured(false);
    if (justCapturedTimeoutRef.current) clearTimeout(justCapturedTimeoutRef.current);
    autoCaptureFiredRef.current = false;
    captureCountdownStartRef.current = null;
    setCaptureCountdown(null);
    setHasFace(false);
    setScanAnchors(null);
    eyesMotionRef.current = new RegionMotionTracker();
    mouthMotionRef.current = new RegionMotionTracker();
    jawMotionRef.current = new RegionMotionTracker();
    // A blink from the previous attempt must not vouch for this one.
    livenessRef.current.reset();
    gateRef.current = new CaptureGateTracker(trackedRegions, { holdMs: holdMs ?? DEFAULT_HOLD_MS });
    setIsReadyToCapture(false);
    setRejectMessage(null);
    // Stop the outgoing stream before requesting a new one — otherwise the
    // old getUserMedia capture is just dropped, leaving the camera running
    // in the background (hardware indicator stays on) indefinitely.
    streamRef.current?.getTracks().forEach((t) => t.stop());
    requestCameraStream()
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch((error: unknown) => setCameraError(cameraErrorMessage(error)));
  }, [previewUrl, trackedRegions, holdMs]);

  // Countdown/success-burst are shared with Eye and Skin — Tongue still
  // captures instantly via maybeAutoCapture() below, no visible countdown.
  const showsCaptureCountdown = assessmentKind === 'face' || assessmentKind === 'eye' || assessmentKind === 'skin';
  const guidanceToast = useGuidanceToast(rejectMessage);
  const systemReady = cameraReady && faceReady;

  const guideState: FaceScanState =
    justCaptured || captureCountdown !== null ? 'success' : !hasFace ? 'waiting' : rejectMessage ? 'error' : 'scanning';

  // Curated per-kind checks for the bottom AiStatusPanel readout — each maps
  // onto that kind's own gated `confirmed` keys (see the trackedRegions memo
  // above), just relabeled/re-iconed into the same 5-slot layout as Face's
  // original panel.
  const statusItems: AiStatusItem[] =
    assessmentKind === 'eye'
      ? [
          {
            key: 'faceDetected',
            label: 'Face',
            icon: ScanFace,
            state: deriveChipState(systemReady, hasFace, hasFace && Boolean(confirmed.singleFace) && Boolean(confirmed.notClipped)),
          },
          { key: 'eyesOpen', label: 'Eyes', icon: Eye, state: deriveChipState(systemReady, hasFace, Boolean(confirmed.eyes) && Boolean(confirmed.eyesOpen)) },
          {
            key: 'pose',
            label: 'Pose',
            icon: Compass,
            state: deriveChipState(systemReady, hasFace, Boolean(confirmed.headTiltOk) && Boolean(confirmed.directionOk ?? confirmed.eyeSizeSymmetryOk)),
          },
          { key: 'properDistance', label: 'Distance', icon: Ruler, state: deriveChipState(systemReady, hasFace, Boolean(confirmed.faceSize)) },
          { key: 'goodLighting', label: 'Light', icon: Sun, state: deriveChipState(systemReady, hasFace, Boolean(confirmed.lightingOk)) },
        ]
      : assessmentKind === 'tongue'
        ? [
            {
              key: 'faceDetected',
              label: 'Face',
              icon: ScanFace,
              state: deriveChipState(systemReady, hasFace, hasFace && Boolean(confirmed.singleFace)),
            },
            {
              key: 'mouthOpen',
              label: 'Mouth',
              icon: Smile,
              state: deriveChipState(systemReady, hasFace, Boolean(confirmed.mouth) && Boolean(confirmed.mouthOpenOk)),
            },
            { key: 'jaw', label: 'Jaw', icon: ScanLine, state: deriveChipState(systemReady, hasFace, Boolean(confirmed.jaw)) },
            { key: 'properDistance', label: 'Distance', icon: Ruler, state: deriveChipState(systemReady, hasFace, Boolean(confirmed.faceSize)) },
            { key: 'goodLighting', label: 'Light', icon: Sun, state: deriveChipState(systemReady, hasFace, Boolean(confirmed.lightingOk)) },
          ]
        : assessmentKind === 'skin'
          ? [
              {
                key: 'faceDetected',
                label: 'Face',
                icon: ScanFace,
                state: deriveChipState(systemReady, hasFace, hasFace && Boolean(confirmed.singleFace) && Boolean(confirmed.notClipped)),
              },
              { key: 'properDistance', label: 'Distance', icon: Ruler, state: deriveChipState(systemReady, hasFace, Boolean(confirmed.faceSize)) },
              { key: 'goodLighting', label: 'Light', icon: Sun, state: deriveChipState(systemReady, hasFace, Boolean(confirmed.lightingOk)) },
              { key: 'focus', label: 'Focus', icon: Focus, state: deriveChipState(systemReady, hasFace, Boolean(confirmed.notBlurry)) },
              {
                key: 'live',
                label: 'Live',
                icon: Fingerprint,
                state: deriveChipState(systemReady, hasFace, Boolean(confirmed.livenessOk) && Boolean(confirmed.eyesOpen)),
              },
            ]
          : [
              // Face — unchanged from the original panel.
              {
                key: 'faceDetected',
                label: 'Face',
                icon: ScanFace,
                state: deriveChipState(systemReady, hasFace, hasFace && Boolean(confirmed.singleFace) && Boolean(confirmed.notClipped)),
              },
              { key: 'eyesOpen', label: 'Eyes', icon: Eye, state: deriveChipState(systemReady, hasFace, Boolean(confirmed.eyes) && Boolean(confirmed.eyesOpen)) },
              { key: 'lookingForward', label: 'Pose', icon: Compass, state: deriveChipState(systemReady, hasFace, Boolean(confirmed.frontal)) },
              { key: 'properDistance', label: 'Distance', icon: Ruler, state: deriveChipState(systemReady, hasFace, Boolean(confirmed.faceSize)) },
              { key: 'goodLighting', label: 'Light', icon: Sun, state: deriveChipState(systemReady, hasFace, Boolean(confirmed.lightingOk)) },
            ];
  const passedCount = statusItems.filter((item) => item.state === 'passed').length;
  const statusComplete = isReadyToCapture || captureCountdown !== null || justCaptured;
  const statusHeadline = statusComplete ? 'Verification successful' : !systemReady ? 'Initializing…' : 'Analyzing your face';
  const statusSubtext = statusComplete ? "You're all set" : "This won't take long";

  if (cameraError) {
    return <MediaErrorState error={cameraError} />;
  }

  if (capturedBlob && previewUrl) {
    return (
      <CameraStage
        onExit={handleRetake}
        status={
          justCaptured ? (
            <p className="flex items-center gap-1.5 text-sm text-status-good">
              <CheckCircle2 className="size-4" /> Image captured successfully. Analyzing…
            </p>
          ) : null
        }
        controls={
          <div className="flex gap-2">
            <Button variant="outline" disabled={isSubmitting} onClick={handleRetake}>
              <RotateCcw className="size-4" /> Retake
            </Button>
            <Button disabled={isSubmitting} onClick={() => onCapture(capturedBlob)}>
              {isSubmitting ? 'Uploading…' : 'Use this photo'}
            </Button>
          </div>
        }
      >
        {/* Mirrored for display only, to match the live mirrored preview the
            shot was framed with — the underlying captured blob keeps its
            true (non-mirrored) orientation. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={previewUrl} alt="Captured photo" className={cn(CAMERA_FEED_CLASS, 'scale-x-[-1]')} />
        {justCaptured ? <CaptureSuccessBurst /> : null}
      </CameraStage>
    );
  }

  return (
    <CameraStage
      prompt={promptText}
      status={
        <div className="flex w-full flex-col items-center gap-2">
          <AiStatusPanel items={statusItems} headline={statusHeadline} subtext={statusSubtext} complete={statusComplete} />
          {/* Live region for screen readers — the panel above is purely visual. */}
          <p className="sr-only" role="status">
            {statusComplete ? 'Verification successful.' : (rejectMessage ?? `${passedCount} of ${statusItems.length} checks passed.`)}
          </p>
        </div>
      }
      controls={
        <Button disabled={!isReadyToCapture} onClick={handleCapture}>
          <Camera className="size-4" /> Capture photo
        </Button>
      }
    >
      <FaceScanFrame state={guideState} />
      <FaceScanTopBar active={systemReady && !justCaptured} label={systemReady && hasFace ? SCAN_CATEGORIES[scanCategoryIndex].label : undefined} />
      <FaceScanHighlights anchors={scanAnchors} category={SCAN_CATEGORIES[scanCategoryIndex]} />
      <GuidanceToast message={guidanceToast} />
      <CaptureCountdown value={captureCountdown} />
      {!systemReady ? <FaceScanLoading cameraReady={cameraReady} /> : null}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        aria-label="Live camera preview"
        className={cn(CAMERA_FEED_CLASS, 'scale-x-[-1]')}
      />
      {/* Offscreen scratch canvases for pixel/lighting sampling — never displayed. */}
      <canvas ref={pixelCanvasRef} className="hidden" />
      <canvas ref={lightingCanvasRef} className="hidden" />
      <canvas ref={qualitySnapshotCanvasRef} className="hidden" />
    </CameraStage>
  );
}
