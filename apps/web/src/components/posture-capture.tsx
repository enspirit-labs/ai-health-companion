'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CheckCircle2, RotateCcw } from 'lucide-react';
import type { PoseLandmarker } from '@mediapipe/tasks-vision';

import { Button } from '@/components/ui/button';
import { CameraStage, CAMERA_FEED_CLASS, CAMERA_OVERLAY_CLASS } from '@/components/camera-stage';
import { CaptureCountdown, CaptureSuccessBurst } from '@/components/face-assessment/capture-countdown';
import { MediaErrorState } from '@/components/media-error-state';
import { cn } from '@/lib/utils';
import { RegionChecklist } from '@/components/region-checklist';
import { CaptureGateTracker } from '@/lib/cv/capture-gate';
import { drawSkeleton, resetSkeletonSmoothing } from '@/lib/cv/draw-pose-overlay';
import { evaluateLightingQuality, sampleLightingImageData, type LightingCheckReason } from '@/lib/cv/lighting-quality';
import { classifyOccupancy, CROWDED_HINT } from '@/lib/cv/occupancy';
import { getPoseConnections, getPoseLandmarker, type PoseConnection } from '@/lib/cv/pose-loader';
import { classifyPoseVisibility, POSE_LM, type Landmark, type PoseCaptureOrientation } from '@/lib/cv/pose-visibility';
import {
  evaluatePostureFraming,
  evaluatePostureSideFraming,
  TORSO_HEIGHT_MAX_RATIO,
  TORSO_HEIGHT_MIN_RATIO,
  type PostureRejectReason,
  type PostureSideRejectReason,
} from '@/lib/cv/posture-framing';
import { cameraErrorMessage, requestCameraStream, type MediaAccessError } from '@/lib/media/user-media';
import { INITIAL_VOICE_GUIDANCE_STATE, speak, speakGuidance, stopSpeaking, type VoiceGuidanceState } from '@/lib/media/voice-guidance';

/** Which of Posture's 3 capture steps this instance is for — 'front'
 * (default) is today's existing single-photo behavior, unchanged.
 * 'left'/'right' are the new sagittal (side) steps. */
export type PostureCaptureOrientation = PoseCaptureOrientation;

interface Props {
  isSubmitting: boolean;
  onCapture: (blob: Blob) => void;
  promptText?: string;
  orientation?: PostureCaptureOrientation;
}

// 'singlePersonOk' applies to every step regardless of orientation — a second
// person in frame is never valid for any of these captures, same rationale as
// Face/Eye's 'singleFace' (face-mesh-capture.tsx) and Squats' own occupancy
// check (squats-test.tsx). Which of two bodies the rest of the checks below
// were even evaluated against is undefined once a second person shows up, so
// this has to gate capture, not just warn about it.
const REQUIRED_REGIONS_FRONT = [
  'lightingOk',
  'eyesOk',
  'earsOk',
  'noseAlignedOk',
  'shouldersHipsOk',
  'tiltOk',
  'distanceOk',
  'arms',
  'legs',
  'singlePersonOk',
];
// Side steps drop eyesOk/noseAlignedOk/tiltOk — none are meaningful from a
// profile (only one eye is ever visible, "nose aligned to shoulder midpoint"
// describes a front-on pose by definition, and shoulder-levelness isn't
// comparable when one shoulder is hidden behind the other) — and replace
// earsOk/shouldersHipsOk with the two new turn-direction/near-side checks.
const REQUIRED_REGIONS_SIDE = ['lightingOk', 'turnedToSideOk', 'nearSideVisibleOk', 'distanceOk', 'arms', 'legs', 'singlePersonOk'];
const INFER_INTERVAL_MS = 130;
// Lighting changes slowly — sampling it a couple of times a second is plenty
// and far cheaper than every pose-inference tick (same rationale as
// squats-test.tsx's own LIGHTING_INTERVAL_MS).
const LIGHTING_INTERVAL_MS = 500;
// TEMPORARY — set to true to log raw torso visibility/tilt/smoothing-buffer
// numbers to the console for threshold tuning. Flip back to false (or
// delete the logging block below) once thresholds are confirmed good.
const DEBUG_TORSO_LOGGING = true;
// TEMPORARY — logs the raw numbers behind the new side-view checks (ear
// visibility/direction convention, near-side shoulder+hip visibility,
// torso-height distance ratio) so the left/right turn-direction convention
// and the reused visibility/distance bars can be confirmed against a real
// camera before being trusted, same discipline as DEBUG_TORSO_LOGGING above.
// Flip back to false once confirmed good.
const DEBUG_POSTURE_SIDE_LOGGING = true;
// TEMPORARY — logs the real numbers behind the multi-person check
// (personCount/crowded/which index was picked as primary) so the exact
// two-person scenario that slipped through before this fix can be confirmed
// caught, using classifyOccupancy()'s own already-tested thresholds
// (occupancy.ts's PERSON_CONFIDENCE_THRESHOLD/SECONDARY_SIZE_RATIO — proven
// via squats-test.tsx, not new numbers). Flip back to false once confirmed good.
const DEBUG_OCCUPANCY_LOGGING = true;
// Spoken (and shown) once every required region has held confirmed long
// enough that auto-capture is about to fire — matches the on-screen copy
// below so what's said and what's shown never disagree.
const READY_MESSAGE = 'Great — hold steady, you can capture now';
const JUST_CAPTURED_DURATION_MS = 2500;
// Visible 3-2-1 countdown once every check passes, rather than capturing the
// instant the gate's own hold timer clears — same mechanism and duration as
// face-mesh-capture.tsx's Face/Eye countdown (CAPTURE_COUNTDOWN_SECONDS
// there), reimplemented here since Posture is its own component driven by
// PoseLandmarker rather than FaceLandmarker, not a shared file.
const CAPTURE_COUNTDOWN_SECONDS = 3;

const REJECT_MESSAGES: Record<Exclude<PostureRejectReason, null>, string> = {
  back: 'Your back is facing the camera. Please turn around to face the camera.',
  side: 'You appear to be sideways. Please face the camera directly.',
  eyes: 'Make sure both your eyes are visible.',
  ears: 'Turn to face the camera so both ears are equally visible.',
  shouldersHips: 'Step back so your shoulders and hips are both visible.',
  tilt: 'Stand up straight and level your shoulders.',
  distanceTooFar: 'Step closer so your body fills more of the frame.',
  distanceTooClose: 'Step back so your whole body is visible.',
};

// Shared with the side-step messages below so 'back' reads identically
// however the user manages to turn all the way around.
const BACK_VIEW_MESSAGE = 'We can no longer see your face. Please turn back slightly so your side profile is visible.';

/** Message for each of the new side-view reject reasons — a function (not a
 * static Record, unlike REJECT_MESSAGES above) since the copy needs to name
 * the actual requested side, not a generic "sideways". */
function sideRejectMessage(reason: Exclude<PostureSideRejectReason, null>, expectedSide: 'left' | 'right'): string {
  switch (reason) {
    case 'back':
      return BACK_VIEW_MESSAGE;
    case 'notTurned':
      return `Turn your body to show your ${expectedSide} side to the camera.`;
    case 'wrongSide':
      return `That's your ${expectedSide === 'left' ? 'right' : 'left'} side — please turn the other way to show your ${expectedSide} side instead.`;
    case 'nearSideHidden':
      return `Step back so your ${expectedSide} shoulder and hip are both clearly visible.`;
    case 'distanceTooFar':
      return 'Step closer so your body fills more of the frame.';
    case 'distanceTooClose':
      return 'Step back so your whole body is visible.';
  }
}

const LIGHTING_MESSAGES: Record<Exclude<LightingCheckReason, null>, string> = {
  too_dark: "It's too dark. Please move to a brighter area.",
  too_bright: 'Lighting is too bright/washed out. Please reduce direct light or move away from strong backlight.',
  uneven: 'Lighting is uneven. Please face a light source directly or reduce shadows from one side.',
  backlit: "You're backlit — try facing a window or light source instead of having it behind you.",
};

export function PostureCapture({ isSubmitting, onCapture, promptText, orientation = 'front' }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const lightingCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const connectionsRef = useRef<PoseConnection[] | null>(null);
  // 'front' vs 'left'/'right' need different required regions (see the two
  // REQUIRED_REGIONS_* consts above) — recomputed defensively on orientation
  // change even though in practice every caller remounts this component per
  // step (eye-assessment-flow.tsx's pattern, mirrored by
  // posture-assessment-flow.tsx), same posture as face-mesh-capture.tsx's own
  // trackedRegions/gateRef handling.
  const requiredRegions = useMemo(() => (orientation === 'front' ? REQUIRED_REGIONS_FRONT : REQUIRED_REGIONS_SIDE), [orientation]);
  const gateRef = useRef(new CaptureGateTracker(requiredRegions));
  const rafRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const lastInferAtRef = useRef(-1);
  const lastTimestampRef = useRef(-1);
  const lastLightingAtRef = useRef(-1);
  const lightingRef = useRef<{ ok: boolean; reason: LightingCheckReason }>({ ok: true, reason: null });
  const voiceStateRef = useRef<VoiceGuidanceState>(INITIAL_VOICE_GUIDANCE_STATE);
  const autoCaptureFiredRef = useRef(false);
  const justCapturedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // When the visible capture countdown started, in the same
  // `performance.now()` timebase as every other timestamp in the inference
  // loop — null while not counting down. See CAPTURE_COUNTDOWN_SECONDS.
  const captureCountdownStartRef = useRef<number | null>(null);

  const [cameraError, setCameraError] = useState<MediaAccessError | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [poseReady, setPoseReady] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [captureCountdown, setCaptureCountdown] = useState<number | null>(null);
  // Reused across both orientations — see the pill labels in the render
  // below for how 'head'/'torso' get relabeled for the side steps rather
  // than needing a second, differently-shaped state object.
  const [checklist, setChecklist] = useState({ head: false, torso: false, arms: false, legs: false });
  const [isReadyToCapture, setIsReadyToCapture] = useState(false);
  const [rejectMessage, setRejectMessage] = useState<string | null>(null);
  const [justCaptured, setJustCaptured] = useState(false);

  useEffect(() => {
    gateRef.current = new CaptureGateTracker(requiredRegions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requiredRegions.join(',')]);

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
    if (cameraReady && poseReady && !capturedBlob) {
      speakGuidance(voiceStateRef, promptText ?? 'Please face the camera and stand upright.', performance.now());
    }
  }, [cameraReady, poseReady, capturedBlob, promptText]);

  useEffect(
    () => () => {
      if (justCapturedTimeoutRef.current) clearTimeout(justCapturedTimeoutRef.current);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([getPoseLandmarker(), getPoseConnections()])
      .then(([landmarker, connections]) => {
        if (cancelled) return;
        landmarkerRef.current = landmarker;
        connectionsRef.current = connections;
        setPoseReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setCameraError({
            kind: 'unavailable',
            message: 'Could not load the pose-tracking model. Try reloading the page.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!cameraReady || !poseReady) return;
    resetSkeletonSmoothing(); // start the overlay's keypoint filter fresh, matching squats-test.tsx
  }, [cameraReady, poseReady]);

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

        speak('Image captured successfully. Analyzing your posture…');
        setJustCaptured(true);
        if (justCapturedTimeoutRef.current) clearTimeout(justCapturedTimeoutRef.current);
        justCapturedTimeoutRef.current = setTimeout(() => setJustCaptured(false), JUST_CAPTURED_DURATION_MS);
      },
      'image/jpeg',
      0.9,
    );
  }, []);

  // Live pose-detection + capture-gate loop. requestAnimationFrame (not
  // setInterval) because detectForVideo requires a monotonically increasing
  // timestamp and rAF auto-pauses on a backgrounded tab.
  useEffect(() => {
    if (!cameraReady || !poseReady || capturedBlob) return;

    let stopped = false;
    const overlay = overlayRef.current;

    const step = () => {
      if (stopped) return;
      const video = videoRef.current;
      const landmarker = landmarkerRef.current;
      const connections = connectionsRef.current;

      // readyState >= HAVE_CURRENT_DATA (2) — videoWidth can already be set
      // from the stream's track settings before the first frame has
      // actually decoded, and calling detectForVideo before then can throw.
      if (video && overlay && landmarker && connections && video.videoWidth > 0 && video.readyState >= 2) {
        const now = performance.now();

        // Posture has no face bounding box (PoseLandmarker doesn't produce
        // one), so the uneven/backlit checks fall back to full-frame halves
        // and the central region respectively — see lighting-quality.ts.
        if (now - lastLightingAtRef.current >= LIGHTING_INTERVAL_MS) {
          lastLightingAtRef.current = now;
          const lightingCanvas = lightingCanvasRef.current;
          if (lightingCanvas) {
            const imageData = sampleLightingImageData(video, lightingCanvas);
            if (imageData) lightingRef.current = evaluateLightingQuality(imageData, null);
          }
        }

        const dueForInference =
          now - lastInferAtRef.current >= INFER_INTERVAL_MS && video.currentTime !== lastVideoTimeRef.current && now > lastTimestampRef.current;

        if (dueForInference) {
          lastVideoTimeRef.current = video.currentTime;
          lastInferAtRef.current = now;
          lastTimestampRef.current = now;

          let landmarks: Landmark[] | undefined;
          let crowded = false;
          try {
            const result = landmarker.detectForVideo(video, now);
            // The detector may return several people — pose-loader.ts
            // configures numPoses: 3 specifically so a bystander is visible
            // to us, not just the assessment's own subject. Previously this
            // blindly read index 0, which never checked whether a second
            // person was even in frame (the confirmed bug: two people in
            // shot, capture still went through). classifyOccupancy() picks
            // the subject deliberately (closest to camera, same as
            // squats-test.tsx's own usage) rather than trusting index 0,
            // which can also jump between bodies frame to frame.
            const occupancy = classifyOccupancy(result.landmarks as Landmark[][] | undefined);
            landmarks = occupancy.primary;
            crowded = occupancy.crowded;

            if (DEBUG_OCCUPANCY_LOGGING) {
              console.log('[posture-occupancy-debug]', {
                personCount: occupancy.personCount,
                crowded: occupancy.crowded,
                primaryIndex: occupancy.primaryIndex,
                rawPoseCount: result.landmarks?.length ?? 0,
              });
            }
          } catch {
            // A single bad frame (e.g. the underlying WASM graph momentarily
            // out of sync with the video) shouldn't crash the whole screen —
            // skip this tick and let the next one retry.
            rafRef.current = requestAnimationFrame(step);
            return;
          }
          // Corrects the tilt check for the video's actual aspect ratio —
          // see the comment on shoulderTiltDegrees() in posture-framing.ts
          // for why an uncorrected check inflates apparent tilt on a
          // non-square (e.g. 4:3) feed.
          const frameAspectRatio = video.videoWidth / video.videoHeight;
          const legacy = classifyPoseVisibility(landmarks, orientation);

          let rejectMessageText: string | null = null;
          let headPillOk: boolean;
          let torsoPillOk: boolean;
          // Read from each branch's own fresh `gate.isReadyToCapture` below,
          // NOT the `isReadyToCapture` React state var — that state update is
          // async and wouldn't reflect this tick's result yet, which would
          // make maybeAutoCapture/the spoken message act one tick stale.
          let readyToCapture = false;

          if (orientation === 'front') {
            // --- Existing front-view path, byte-for-byte unchanged ----------
            const framing = evaluatePostureFraming(landmarks, frameAspectRatio);
            const gate = gateRef.current.update(
              {
                lightingOk: lightingRef.current.ok,
                lightingBacklit: lightingRef.current.reason === 'backlit',
                eyesOk: framing.eyesOk,
                earsOk: framing.earsOk,
                noseAlignedOk: framing.noseAlignedOk,
                shouldersHipsOk: framing.shouldersHipsOk,
                tiltOk: framing.tiltOk,
                distanceOk: framing.distanceOk,
                arms: legacy.arms,
                legs: legacy.legs,
                singlePersonOk: !crowded,
              },
              now,
            );

            if (DEBUG_TORSO_LOGGING) {
              console.log('[torso-debug] visibility', {
                leftShoulder: landmarks?.[POSE_LM.leftShoulder]?.visibility,
                rightShoulder: landmarks?.[POSE_LM.rightShoulder]?.visibility,
                leftHip: landmarks?.[POSE_LM.leftHip]?.visibility,
                rightHip: landmarks?.[POSE_LM.rightHip]?.visibility,
              });
              console.log('[torso-debug] tilt', {
                tiltDegrees: framing.tiltDegrees,
                frameAspectRatio,
                tiltOk: framing.tiltOk,
              });
              console.log('[torso-debug] distance', {
                torsoHeightRatio: framing.torsoHeightRatio,
                torsoHeightMinRatio: TORSO_HEIGHT_MIN_RATIO,
                torsoHeightMaxRatio: TORSO_HEIGHT_MAX_RATIO,
                distanceOk: framing.distanceOk,
              });
              for (const key of ['shouldersHipsOk', 'tiltOk', 'distanceOk'] as const) {
                console.log(`[torso-debug] buffer:${key}`, gateRef.current.getDebugSnapshot(key));
              }
              console.log('[torso-debug] torso pill inputs', {
                shouldersHipsConfirmed: gate.confirmed.shouldersHipsOk,
                tiltConfirmed: gate.confirmed.tiltOk,
                distanceConfirmed: gate.confirmed.distanceOk,
              });
            }

            readyToCapture = gate.isReadyToCapture;
            headPillOk = gate.confirmed.eyesOk && gate.confirmed.earsOk && gate.confirmed.noseAlignedOk;
            torsoPillOk = gate.confirmed.shouldersHipsOk && gate.confirmed.tiltOk && gate.confirmed.distanceOk;

            overlay.width = video.videoWidth;
            overlay.height = video.videoHeight;
            const ctx = overlay.getContext('2d');
            if (ctx) {
              ctx.clearRect(0, 0, overlay.width, overlay.height);
              if (landmarks) drawSkeleton(ctx, landmarks, connections, overlay.width, overlay.height);
            }

            setChecklist({ head: headPillOk, torso: torsoPillOk, arms: gate.confirmed.arms, legs: gate.confirmed.legs });
            setIsReadyToCapture(gate.isReadyToCapture);

            const lightingReason =
              lightingRef.current.reason === 'backlit' && !gate.confirmed.lightingBacklit ? null : lightingRef.current.reason;
            const message = !lightingRef.current.ok && lightingReason
              ? LIGHTING_MESSAGES[lightingReason]
              : framing.rejectReason
                ? REJECT_MESSAGES[framing.rejectReason]
                : null;
            rejectMessageText = gate.isReadyToCapture ? null : message;

            if (gate.isReadyToCapture && !autoCaptureFiredRef.current) {
              console.log('[auto-capture-about-to-fire]', {
                orientation,
                confirmed: gate.confirmed,
                allRequiredConfirmed: gate.allRequiredConfirmed,
                requiredRegionsTracked: requiredRegions,
              });
            }
          } else {
            // --- New side-view (sagittal) path -------------------------------
            const sideFraming = evaluatePostureSideFraming(landmarks, orientation, frameAspectRatio);
            const gate = gateRef.current.update(
              {
                lightingOk: lightingRef.current.ok,
                lightingBacklit: lightingRef.current.reason === 'backlit',
                turnedToSideOk: sideFraming.turnedToExpectedSide,
                nearSideVisibleOk: sideFraming.nearSideVisible,
                distanceOk: sideFraming.distanceOk,
                arms: legacy.arms,
                legs: legacy.legs,
                singlePersonOk: !crowded,
              },
              now,
            );

            if (DEBUG_POSTURE_SIDE_LOGGING) {
              const nearElbow = orientation === 'left' ? POSE_LM.leftElbow : POSE_LM.rightElbow;
              const nearWrist = orientation === 'left' ? POSE_LM.leftWrist : POSE_LM.rightWrist;
              const nearKnee = orientation === 'left' ? POSE_LM.leftKnee : POSE_LM.rightKnee;
              const nearAnkle = orientation === 'left' ? POSE_LM.leftAnkle : POSE_LM.rightAnkle;
              console.log('[posture-side-debug] direction', {
                expectedSide: orientation,
                leftEarVisibility: sideFraming.leftEarVisibility,
                rightEarVisibility: sideFraming.rightEarVisibility,
                earVisibleThreshold: 0.6,
                earHiddenThreshold: 0.4,
                turnedToExpectedSide: sideFraming.turnedToExpectedSide,
                turnedToWrongSide: sideFraming.turnedToWrongSide,
                signedNoseOffsetRatio: sideFraming.signedNoseOffsetRatio,
              });
              console.log('[posture-side-debug] near-side visibility', {
                nearShoulderVisibility: landmarks?.[orientation === 'left' ? POSE_LM.leftShoulder : POSE_LM.rightShoulder]?.visibility,
                nearHipVisibility: landmarks?.[orientation === 'left' ? POSE_LM.leftHip : POSE_LM.rightHip]?.visibility,
                shoulderVisibilityThreshold: 0.6,
                hipVisibilityThreshold: 0.5,
                nearSideVisible: sideFraming.nearSideVisible,
                nearElbowVisibility: landmarks?.[nearElbow]?.visibility,
                nearWristVisibility: landmarks?.[nearWrist]?.visibility,
                nearKneeVisibility: landmarks?.[nearKnee]?.visibility,
                nearAnkleVisibility: landmarks?.[nearAnkle]?.visibility,
                armsVisibilityThreshold: 0.5,
                legsVisibilityThreshold: 0.5,
                armsConfirmed: gate.confirmed.arms,
                legsConfirmed: gate.confirmed.legs,
              });
              console.log('[posture-side-debug] distance', {
                torsoHeightRatio: sideFraming.torsoHeightRatio,
                torsoHeightMinRatio: TORSO_HEIGHT_MIN_RATIO,
                torsoHeightMaxRatio: TORSO_HEIGHT_MAX_RATIO,
                distanceOk: sideFraming.distanceOk,
              });
              console.log('[posture-side-debug] verdict', {
                orientation: sideFraming.orientation,
                rejectReason: sideFraming.rejectReason,
                confirmed: gate.confirmed,
                allRequiredConfirmed: gate.allRequiredConfirmed,
                isReadyToCapture: gate.isReadyToCapture,
              });
            }

            readyToCapture = gate.isReadyToCapture;
            headPillOk = gate.confirmed.turnedToSideOk;
            torsoPillOk = gate.confirmed.nearSideVisibleOk;

            overlay.width = video.videoWidth;
            overlay.height = video.videoHeight;
            const ctx = overlay.getContext('2d');
            if (ctx) {
              ctx.clearRect(0, 0, overlay.width, overlay.height);
              if (landmarks) drawSkeleton(ctx, landmarks, connections, overlay.width, overlay.height);
            }

            setChecklist({ head: headPillOk, torso: torsoPillOk, arms: gate.confirmed.arms, legs: gate.confirmed.legs });
            setIsReadyToCapture(gate.isReadyToCapture);

            const lightingReason =
              lightingRef.current.reason === 'backlit' && !gate.confirmed.lightingBacklit ? null : lightingRef.current.reason;
            const message = !lightingRef.current.ok && lightingReason
              ? LIGHTING_MESSAGES[lightingReason]
              : sideFraming.rejectReason
                ? sideRejectMessage(sideFraming.rejectReason, orientation)
                : null;
            rejectMessageText = gate.isReadyToCapture ? null : message;

            if (gate.isReadyToCapture && !autoCaptureFiredRef.current) {
              console.log('[auto-capture-about-to-fire]', {
                orientation,
                confirmed: gate.confirmed,
                allRequiredConfirmed: gate.allRequiredConfirmed,
                requiredRegionsTracked: requiredRegions,
              });
            }
          }

          // Outranks every orientation-specific reason above, same rationale
          // as face-mesh-capture.tsx's 'multipleFaces' override: which of two
          // bodies the framing/lighting checks even ran against is undefined
          // once a second person is in frame, so "you're not alone in shot"
          // is the only honest message — regardless of what the front/side
          // branch above happened to compute as its own rejectReason.
          if (crowded) rejectMessageText = CROWDED_HINT;

          setRejectMessage(rejectMessageText);
          const spokenMessage = readyToCapture ? READY_MESSAGE : rejectMessageText;
          if (spokenMessage) speakGuidance(voiceStateRef, spokenMessage, now);

          // Visible 3-2-1 countdown instead of an instant capture — same
          // mechanism as face-mesh-capture.tsx's Face/Eye countdown, timed off
          // this same tick's `now` rather than a separate setInterval so it
          // shares the inference loop's own pause/resume behavior. Applies to
          // both front and side steps, since they converge on this one shared
          // readyToCapture/handleCapture call.
          if (readyToCapture) {
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
        }
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      stopped = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      overlay?.getContext('2d')?.clearRect(0, 0, overlay.width, overlay.height);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraReady, poseReady, capturedBlob, handleCapture, orientation, requiredRegions.join(',')]);

  const handleRetake = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setCapturedBlob(null);
    setJustCaptured(false);
    if (justCapturedTimeoutRef.current) clearTimeout(justCapturedTimeoutRef.current);
    autoCaptureFiredRef.current = false;
    captureCountdownStartRef.current = null;
    setCaptureCountdown(null);
    gateRef.current = new CaptureGateTracker(requiredRegions);
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
  }, [previewUrl, requiredRegions]);

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
              <CheckCircle2 className="size-4" /> Image captured successfully. Analyzing your posture…
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

  // Pill labels differ by orientation — the underlying checklist state shape
  // ({head, torso, arms, legs}) stays the same either way (see the setChecklist
  // calls above), only what each pill means and is called changes.
  const headLabel = orientation === 'front' ? 'Head' : 'Turn';
  const torsoLabel = orientation === 'front' ? 'Torso' : 'Position';
  const defaultBodyMessage =
    orientation === 'front'
      ? 'Step back so your head, torso, arms, and legs are all visible'
      : `Turn to show your ${orientation} side, with your whole body visible`;

  return (
    <CameraStage
      className="border-4 border-destructive"
      prompt={promptText}
      banner={
        rejectMessage ? (
          <div className="bg-destructive px-3 py-2 text-center text-sm font-semibold text-destructive-foreground">
            {rejectMessage}
          </div>
        ) : null
      }
      status={
        <>
          <div className="cam-full:text-white">
            <RegionChecklist
              items={[
                { key: 'head', label: headLabel, confirmed: checklist.head },
                { key: 'torso', label: torsoLabel, confirmed: checklist.torso },
                { key: 'arms', label: 'Arms', confirmed: checklist.arms },
                { key: 'legs', label: 'Legs', confirmed: checklist.legs },
              ]}
            />
          </div>

          {!rejectMessage ? (
            <p className="text-center text-sm text-muted-foreground cam-full:text-white/85">
              {!cameraReady
                ? 'Starting camera…'
                : !poseReady
                  ? 'Loading pose tracking…'
                  : isReadyToCapture
                    ? READY_MESSAGE
                    : defaultBodyMessage}
            </p>
          ) : null}
        </>
      }
      controls={
        <Button disabled={!isReadyToCapture} onClick={handleCapture}>
          <Camera className="size-4" /> Capture photo
        </Button>
      }
    >
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
        <div className="h-5/6 w-2/3 rounded-2xl border-2 border-dashed border-white/70" />
      </div>
      <CaptureCountdown value={captureCountdown} />
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        aria-label="Live camera preview"
        className={cn(CAMERA_FEED_CLASS, 'scale-x-[-1]')}
      />
      <canvas ref={overlayRef} className={cn(CAMERA_OVERLAY_CLASS, 'scale-x-[-1]')} />
      {/* Offscreen scratch canvas for lighting sampling — never displayed. */}
      <canvas ref={lightingCanvasRef} className="hidden" />
    </CameraStage>
  );
}
