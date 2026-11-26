'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw, Square, Volume2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { CameraStage, CAMERA_FEED_CLASS, CAMERA_OVERLAY_CLASS } from '@/components/camera-stage';
import { MediaErrorState } from '@/components/media-error-state';
import { RegionChecklist } from '@/components/region-checklist';
import { cn } from '@/lib/utils';
import { drawSkeleton, resetSkeletonSmoothing } from '@/lib/cv/draw-pose-overlay';
import { classifyFacing, type FacingResult } from '@/lib/cv/facing-direction';
import { chooseGuidanceCue } from '@/lib/cv/guidance-cue';
import {
  ABSENT_CUE_KEY,
  ABSENT_HINT,
  classifyOccupancy,
  CROWDED_CUE_KEY,
  CROWDED_HINT,
  EMPTY_OCCUPANCY,
  type OccupancyResult,
} from '@/lib/cv/occupancy';
import { analyzeLighting, type LightingResult } from '@/lib/cv/lighting';
import { getPoseConnections, getPoseLandmarker, type PoseConnection } from '@/lib/cv/pose-loader';
import { classifyPoseVisibility, type Landmark, type PoseVisibilityResult } from '@/lib/cv/pose-visibility';
import { analyzeWalkingPosture, type WalkingPostureResult } from '@/lib/cv/walking-posture';
import {
  INITIAL_WALKING_SESSION_STATE,
  summarizeWalkingSession,
  updateWalkingSession,
  type WalkingSessionState,
  type WalkingSessionSummary,
} from '@/lib/cv/walking-posture-session';
import { useSpeechCue } from '@/lib/voice/use-speech-cue';
import { cameraErrorMessage, requestCameraStream, type MediaAccessError } from '@/lib/media/user-media';
import type { PoseLandmarker } from '@mediapipe/tasks-vision';

interface Props {
  isSubmitting: boolean;
  onCaptureFrames: (frames: Blob[]) => void;
  /** Overrides the heading shown above the capture frame, e.g. for POSTURE's
   * "Step back so your full body is visible" prompt. */
  promptText?: string;
}

const MAX_DURATION_SECONDS = 8;
const FRAME_COUNT = 5;
const RECORDER_MIME_CANDIDATES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

// Guidance text doesn't need per-frame updates — throttling inference keeps
// CPU/battery reasonable on older phones. Backed off further while recording,
// since encoding + inference at the same time is the heaviest moment.
const INFER_INTERVAL_MS_IDLE = 130;
const INFER_INTERVAL_MS_RECORDING = 250;
/** Lighting changes slowly — sampling it a couple of times a second is plenty
 * and far cheaper than every pose-inference tick. */
const LIGHTING_INTERVAL_MS = 500;
/** The user must hold a correct position this long before the countdown begins,
 * so a brief glance away doesn't false-trigger it. */
const POSITION_HOLD_MS = 1500;
/** Countdown start value spoken before recording begins (5…1). */
const COUNTDOWN_FROM = 5;

/** idle: waiting for the user's one tap (unlocks voice, arms the flow).
 *  positioning: guiding the user into frame by voice.
 *  countdown: correct position held → counting 5→1 by voice.
 *  recording: the walk is being recorded and posture graded live.
 *  review: recording finished, previewing before upload. */
type Flow = 'idle' | 'positioning' | 'countdown' | 'recording' | 'review';

const NO_REGIONS: PoseVisibilityResult = {
  head: false,
  torso: false,
  arms: false,
  legs: false,
  missing: ['head', 'torso', 'arms', 'legs'],
};

const NOT_FACING: FacingResult = { direction: 'unknown', isFacingForward: false };
const NO_POSTURE: WalkingPostureResult = { measured: false, faults: [], primary: null, score: 0 };

/** Human-readable summary line for each persistent fault in the review panel. */
const FAULT_SUMMARY_TEXT: Record<string, string> = {
  'shoulder-tilt': 'Your shoulders stayed uneven while walking',
  'hip-drop': 'One hip dropped as you walked',
  'lateral-lean': 'Your trunk leaned to one side',
  'head-forward': 'Your head was carried off-centre',
  'trunk-flexion': 'You walked hunched forward',
};

function pickSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return RECORDER_MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
}

/** Seeks through the recorded clip and draws N evenly-spaced frames to a
 * canvas, returning each as a JPEG blob — these are what actually get
 * uploaded and reasoned over, not the raw video. */
async function extractFrames(videoBlob: Blob, count: number): Promise<Blob[]> {
  const url = URL.createObjectURL(videoBlob);
  const video = document.createElement('video');
  video.src = url;
  video.muted = true;
  video.playsInline = true;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('Failed to load recorded video'));
  });

  const duration = video.duration || 1;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');

  const frames: Blob[] = [];
  for (let i = 0; i < count; i += 1) {
    const target = count === 1 ? 0 : duration * (i / (count - 1));
    const seekTo = Math.min(target, Math.max(duration - 0.05, 0));
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      video.currentTime = seekTo;
    });
    if (!ctx) continue;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (blob) frames.push(blob);
  }

  URL.revokeObjectURL(url);
  return frames;
}

export function WalkingCapture({ isSubmitting, onCaptureFrames, promptText }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const connectionsRef = useRef<PoseConnection[] | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const lastInferAtRef = useRef(-1);
  const lastTimestampRef = useRef(-1);
  // Flow state machine — mirrored to `flow` state for render, held in a ref for
  // the rAF loop (which must read the current value without re-subscribing).
  const flowRef = useRef<Flow>('idle');
  // When the correct position was first held continuously; null when not held.
  const positionHeldSinceRef = useRef<number | null>(null);
  // Lighting guidance, sampled on its own slower cadence.
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastLightingAtRef = useRef(-1);
  const lightingRef = useRef<LightingResult | null>(null);
  // Accumulated posture grading across the recording.
  const sessionRef = useRef<WalkingSessionState>(INITIAL_WALKING_SESSION_STATE);
  // Who's in frame this instant. Mirrored to state for render; the rAF loop
  // reads the value it just computed directly.
  const occupancyRef = useRef<OccupancyResult>(EMPTY_OCCUPANCY);

  const [cameraError, setCameraError] = useState<MediaAccessError | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [poseReady, setPoseReady] = useState(false);
  const [flow, setFlow] = useState<Flow>('idle');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isExtracting, setIsExtracting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [regions, setRegions] = useState<PoseVisibilityResult>(NO_REGIONS);
  const [facing, setFacing] = useState<FacingResult>(NOT_FACING);
  const [lighting, setLighting] = useState<LightingResult | null>(null);
  const [posture, setPosture] = useState<WalkingPostureResult>(NO_POSTURE);
  const [occupancy, setOccupancy] = useState<OccupancyResult>(EMPTY_OCCUPANCY);
  const [summary, setSummary] = useState<WalkingSessionSummary | null>(null);

  const voice = useSpeechCue();

  const setFlowBoth = useCallback((next: Flow) => {
    flowRef.current = next;
    setFlow(next);
  }, []);

  const startCamera = useCallback(() => {
    // Stop the outgoing stream before requesting a new one — otherwise the
    // old getUserMedia capture is just dropped, leaving the camera running
    // in the background (hardware indicator stays on) indefinitely. Only
    // matters on the retake path (see below); on first mount streamRef is
    // still null so this is a no-op.
    streamRef.current?.getTracks().forEach((t) => t.stop());
    requestCameraStream()
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraReady(true);
      })
      .catch((error: unknown) => setCameraError(cameraErrorMessage(error)));
  }, []);

  useEffect(() => {
    let cancelled = false;

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
    };
  }, []);

  // Load the pose model + skeleton connections in the background. Unlike the
  // previous best-effort framing guide, the guided flow depends on pose for its
  // countdown trigger and posture grading, so surface a failure.
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

  // Draws the current video frame to a tiny offscreen canvas and returns its
  // RGBA pixels for lighting analysis. Small (64×48) and reused each call.
  function sampleLighting(video: HTMLVideoElement): Uint8ClampedArray | undefined {
    if (!sampleCanvasRef.current) sampleCanvasRef.current = document.createElement('canvas');
    const canvas = sampleCanvasRef.current;
    canvas.width = 64;
    canvas.height = 48;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return undefined;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  }

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleStop = useCallback(() => {
    recorderRef.current?.stop();
  }, []);

  // Begins the actual recording plus live posture grading.
  const beginRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;

    sessionRef.current = INITIAL_WALKING_SESSION_STATE;
    setSummary(null);
    setCountdown(null);

    chunksRef.current = [];
    const mimeType = pickSupportedMimeType();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
      setRecordedBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
      stopTimer();
      const result = summarizeWalkingSession(sessionRef.current);
      setSummary(result);
      setFlowBoth('review');
      streamRef.current?.getTracks().forEach((t) => t.stop());
      // Spoken wrap-up: name the main fault, or confirm a clean walk.
      if (result.rating === 'inconclusive') {
        voice.sayNow('I could not see you well enough to check your posture');
      } else if (result.persistentFaults.length > 0) {
        const worst = result.persistentFaults[0].kind;
        voice.sayNow(FAULT_SUMMARY_TEXT[worst] ?? 'Check your walking posture');
      } else {
        voice.sayNow('Nice walking posture');
      }
    };

    recorder.start();
    setFlowBoth('recording');
    setElapsedSeconds(0);
    voice.sayNow("Let's start — walk normally");

    timerRef.current = setInterval(() => {
      setElapsedSeconds((s) => {
        const next = s + 1;
        if (next >= MAX_DURATION_SECONDS) recorder.stop();
        return next;
      });
    }, 1000);
  }, [stopTimer, voice, setFlowBoth]);

  // Runs the 5→1 spoken countdown, then starts recording. If the user leaves
  // position mid-countdown, the rAF loop calls abortCountdown().
  const beginCountdown = useCallback(() => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    setFlowBoth('countdown');
    let n = COUNTDOWN_FROM;
    setCountdown(n);
    voice.sayNow(String(n));
    countdownTimerRef.current = setInterval(() => {
      n -= 1;
      if (n >= 1) {
        setCountdown(n);
        voice.sayNow(String(n));
      } else {
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
        beginRecording();
      }
    }, 1000);
  }, [voice, setFlowBoth, beginRecording]);

  const abortCountdown = useCallback(() => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = null;
    setCountdown(null);
    positionHeldSinceRef.current = null;
    setFlowBoth('positioning');
  }, [setFlowBoth]);

  // The one required user gesture: unlocks voice (browsers block TTS until a
  // tap) and arms the auto-flow. Everything after is automatic.
  const handleBegin = useCallback(() => {
    voice.enable();
    positionHeldSinceRef.current = null;
    resetSkeletonSmoothing(); // start the overlay's keypoint filter fresh
    setFlowBoth('positioning');
  }, [voice, setFlowBoth]);

  // Live pose-detection loop: framing/lighting guidance while positioning, then
  // per-frame posture grading while recording. requestAnimationFrame (not
  // setInterval) because detectForVideo requires a monotonically increasing
  // timestamp and rAF auto-pauses on a backgrounded tab.
  const isReviewing = flow === 'review';

  useEffect(() => {
    if (!cameraReady || !poseReady || isReviewing) return;

    let stopped = false;
    // Captured once up front (rather than re-read inside the cleanup below)
    // since the ref may already be detached by the time cleanup runs.
    const overlay = overlayRef.current;

    const step = () => {
      if (stopped) return;
      const video = videoRef.current;
      const landmarker = landmarkerRef.current;
      const connections = connectionsRef.current;

      if (video && overlay && landmarker && connections && video.videoWidth > 0) {
        const now = performance.now();
        const recording = flowRef.current === 'recording';
        const inferIntervalMs = recording ? INFER_INTERVAL_MS_RECORDING : INFER_INTERVAL_MS_IDLE;
        const dueForInference =
          now - lastInferAtRef.current >= inferIntervalMs &&
          video.currentTime !== lastVideoTimeRef.current &&
          now > lastTimestampRef.current;

        if (dueForInference) {
          lastVideoTimeRef.current = video.currentTime;
          lastInferAtRef.current = now;
          lastTimestampRef.current = now;

          const result = landmarker.detectForVideo(video, now);
          // Pick the subject deliberately rather than trusting index 0: the
          // detector ranks by its own confidence, so with anyone else in shot
          // index 0 can flip between bodies from frame to frame and the posture
          // grade would silently describe a passer-by. Same approach as squats.
          const occupancyResult = classifyOccupancy(result.landmarks as Landmark[][] | undefined);
          occupancyRef.current = occupancyResult;
          setOccupancy(occupancyResult);
          const landmarks = occupancyResult.primary;
          const crowded = occupancyResult.crowded;

          overlay.width = video.videoWidth;
          overlay.height = video.videoHeight;
          const ctx = overlay.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, overlay.width, overlay.height);
            if (landmarks) drawSkeleton(ctx, landmarks, connections, overlay.width, overlay.height);
          }

          const regionResult = classifyPoseVisibility(landmarks);
          setRegions(regionResult);
          const facingResult = classifyFacing(landmarks);
          setFacing(facingResult);

          if (now - lastLightingAtRef.current >= LIGHTING_INTERVAL_MS) {
            lastLightingAtRef.current = now;
            const lightingResult = analyzeLighting(sampleLighting(video));
            lightingRef.current = lightingResult;
            setLighting(lightingResult);
          }

          const phase = flowRef.current;

          if (phase === 'positioning' || phase === 'countdown') {
            // Correctly positioned this frame? Exactly one person present,
            // framed, facing forward, lighting usable — the same bar the squats
            // flow uses. Occupancy is a hard precondition at both ends: with
            // nobody there the readings describe no one, and with a bystander
            // present we can't be sure they describe the right person.
            const positionOk =
              occupancyResult.personCount === 1 &&
              !crowded &&
              regionResult.missing.length === 0 &&
              facingResult.isFacingForward &&
              (lightingRef.current?.ok ?? true);

            if (phase === 'positioning') {
              // Speak the single most important positioning cue (debounced by
              // the voice manager so it never spams). Occupancy is passed in so
              // an empty frame asks the user to step INTO shot rather than
              // firing the framing cue's "step back" at nobody.
              const cue = chooseGuidanceCue({
                lighting: lightingRef.current,
                regions: regionResult,
                facing: facingResult,
                started: false,
                occupancy: occupancyResult,
              });
              if (!cue.ok) voice.cue(cue.key, cue.text);

              if (positionOk) {
                if (positionHeldSinceRef.current == null) positionHeldSinceRef.current = now;
                if (now - positionHeldSinceRef.current >= POSITION_HOLD_MS) {
                  positionHeldSinceRef.current = null;
                  beginCountdown();
                }
              } else {
                positionHeldSinceRef.current = null;
              }
            } else if (!positionOk) {
              // Drifted out of position mid-countdown — cancel and re-guide.
              abortCountdown();
            }
          } else if (phase === 'recording') {
            // Grading is only meaningful for a single, identifiable subject.
            // With extra people the subject pick can flip between frames, and
            // with nobody there is nothing to measure — in both cases feeding
            // the session would corrupt the final posture score, so skip the
            // frame entirely and coach the frame back to a usable state. The
            // recording clock keeps running: the user is losing their own take,
            // which is the incentive to fix it quickly.
            if (occupancyResult.personCount === 0) {
              setPosture(NO_POSTURE);
              voice.cue(ABSENT_CUE_KEY, ABSENT_HINT);
            } else if (crowded) {
              setPosture(NO_POSTURE);
              voice.cue(CROWDED_CUE_KEY, CROWDED_HINT);
            } else {
              // Grade posture every inference tick and coach the worst fault.
              const frame = analyzeWalkingPosture(landmarks);
              setPosture(frame);
              sessionRef.current = updateWalkingSession(sessionRef.current, frame);
              if (frame.primary) voice.cue(frame.primary.kind, frame.primary.hint);
            }
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
    // `voice` methods are stable useCallbacks; excluding it keeps the rAF loop
    // from being torn down and rebuilt on unrelated re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraReady, poseReady, isReviewing]);

  const handleRetake = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setRecordedBlob(null);
    setSummary(null);
    setPosture(NO_POSTURE);
    setElapsedSeconds(0);
    sessionRef.current = INITIAL_WALKING_SESSION_STATE;
    positionHeldSinceRef.current = null;
    occupancyRef.current = EMPTY_OCCUPANCY;
    setOccupancy(EMPTY_OCCUPANCY);
    // Drop the smoothed keypoints from the previous take, so the overlay
    // doesn't ease in from wherever the body was when recording stopped.
    resetSkeletonSmoothing();
    // Voice is already unlocked from the first tap, so go straight back to
    // guiding the user into position rather than back to idle.
    setFlowBoth('positioning');
    startCamera();
  }, [previewUrl, setFlowBoth, startCamera]);

  const handleUseRecording = useCallback(async () => {
    if (!recordedBlob) return;
    setIsExtracting(true);
    try {
      const frames = await extractFrames(recordedBlob, FRAME_COUNT);
      onCaptureFrames(frames);
    } finally {
      setIsExtracting(false);
    }
  }, [recordedBlob, onCaptureFrames]);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      // Silence in-flight speech on the way out — speechSynthesis is a global
      // that outlives this component, so the posture wrap-up spoken on `onstop`
      // would otherwise keep talking over whatever screen comes next.
      voice.stop();
    },
    // `voice.stop` is a stable useCallback — this must run on unmount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  if (cameraError) {
    return <MediaErrorState error={cameraError} />;
  }

  if (flow === 'review' && recordedBlob && previewUrl) {
    const clean = summary && summary.rating !== 'inconclusive' && summary.persistentFaults.length === 0;

    return (
      <div className="flex flex-col items-center gap-3">
        <video src={previewUrl} controls className="w-full max-w-lg rounded-xl border" />

        {summary ? (
          <div className="w-full max-w-lg rounded-xl border p-4">
            {summary.rating === 'inconclusive' ? (
              <p className="text-sm text-muted-foreground">
                Couldn’t see your body well enough to check your posture — retake if you’d like a posture read.
              </p>
            ) : (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium">Walking posture</span>
                  <span
                    className={cn(
                      'text-2xl font-bold tabular-nums',
                      clean ? 'text-status-good' : summary.rating === 'poor' ? 'text-destructive' : 'text-status-warning',
                    )}
                  >
                    {summary.postureScore}
                    <span className="text-sm font-normal text-muted-foreground">/100</span>
                  </span>
                </div>
                {clean ? (
                  <p className="mt-2 text-sm text-status-good">No posture problems detected — nice walking form.</p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-1">
                    {summary.persistentFaults.map((fault) => (
                      <li key={fault.kind} className="text-sm text-destructive">
                        • {FAULT_SUMMARY_TEXT[fault.kind] ?? fault.kind}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        ) : null}

        <div className="flex gap-2">
          <Button variant="outline" disabled={isSubmitting || isExtracting} onClick={handleRetake}>
            <RotateCcw className="size-4" /> Retake
          </Button>
          <Button disabled={isSubmitting || isExtracting} onClick={handleUseRecording}>
            {isExtracting ? 'Preparing…' : isSubmitting ? 'Uploading…' : 'Use this recording'}
          </Button>
        </div>
      </div>
    );
  }

  const setup = flow === 'idle' || flow === 'positioning' || flow === 'countdown';
  const recording = flow === 'recording';
  const lightingWarning = lighting && !lighting.ok ? lighting.hint : null;
  const showFacingWarning = regions.torso && !facing.isFacingForward;
  // The live posture fault to flag in red while walking.
  const postureFault = recording ? posture.primary : null;
  // Who's in frame. Both states block the assessment outright and stay visible
  // during the recording too — someone wandering in, or the user walking out of
  // shot, does the most damage exactly then. Suppressed while idle, where "no
  // pose yet" only means the model hasn't warmed up.
  const absentWarning = occupancy.personCount === 0 && flow !== 'idle';
  const crowdedWarning = occupancy.crowded && flow !== 'idle';
  // Present, but only part of the body fits. Red rather than a soft warning:
  // the missing regions are the ones the posture grader needs.
  const partialWarning = !absentWarning && occupancy.personCount > 0 && regions.missing.length > 0 && flow !== 'idle';
  const partialHint = `Step back — I can't see your ${regions.missing.join(', ')}`;
  // Any state where we cannot assess the user at all.
  const blockingWarning = absentWarning || crowdedWarning || partialWarning;

  // Priority: hardware readiness, then who's in frame (absent → crowded →
  // partly out of frame), then countdown/recording, then setup coaching.
  // Occupancy outranks the posture fault: a fault measured off the wrong body,
  // or off no body, isn't worth showing.
  function currentStatusText(): string {
    if (!cameraReady) return 'Starting camera…';
    if (!poseReady) return 'Loading pose tracking…';
    if (absentWarning) return ABSENT_HINT;
    if (crowdedWarning) return CROWDED_HINT;
    if (partialWarning) return partialHint;
    if (flow === 'idle') return 'Tap “Enable voice & begin” when you’re ready.';
    if (flow === 'countdown') return 'Hold still — starting…';
    if (recording) {
      return postureFault ? postureFault.hint : `Walking… ${elapsedSeconds}s / ${MAX_DURATION_SECONDS}s`;
    }
    if (lightingWarning) return lightingWarning;
    if (showFacingWarning) return 'Turn to face the camera straight on';
    return 'Great — hold that position, counting you in…';
  }

  const statusText = currentStatusText();

  return (
    <CameraStage
      prompt={promptText}
      className={cn(
        'transition-shadow',
        // Red ring for anything that blocks the assessment (nobody in frame,
        // extra people, body cut off) or a live posture fault while walking.
        (blockingWarning || postureFault) && 'ring-4 ring-destructive',
        !postureFault && !blockingWarning && setup && showFacingWarning && 'ring-4 ring-status-warning',
      )}
      banner={
        /* Who's in frame outranks everything: a posture fault measured off the
           wrong body — or off no body — isn't worth showing. */
        absentWarning ? (
          <div className="bg-destructive px-3 py-2 text-center text-sm font-semibold text-destructive-foreground">
            {ABSENT_HINT}
          </div>
        ) : crowdedWarning ? (
          <div className="bg-destructive px-3 py-2 text-center text-sm font-semibold text-destructive-foreground">
            {CROWDED_HINT}
          </div>
        ) : partialWarning ? (
          <div className="bg-destructive px-3 py-2 text-center text-sm font-semibold text-destructive-foreground">
            {partialHint}
          </div>
        ) : /* Live posture fault — red, and takes priority over setup warnings. */
        postureFault ? (
          <div className="bg-destructive px-3 py-2 text-center text-sm font-semibold text-destructive-foreground">
            {postureFault.label} — {postureFault.hint}
          </div>
        ) : setup && lightingWarning ? (
          <div className="bg-status-warning px-3 py-2 text-center text-sm font-semibold text-black">
            {lightingWarning}
          </div>
        ) : setup && showFacingWarning ? (
          <div className="bg-status-warning px-3 py-2 text-center text-sm font-semibold text-black">
            Face the camera directly
          </div>
        ) : null
      }
      status={
        <>
          {setup ? (
            <div className="cam-full:text-white">
              <RegionChecklist
                items={[
                  { key: 'head', label: 'Head', confirmed: regions.head },
                  { key: 'torso', label: 'Torso', confirmed: regions.torso },
                  { key: 'arms', label: 'Arms', confirmed: regions.arms },
                  { key: 'legs', label: 'Legs', confirmed: regions.legs },
                ]}
              />
            </div>
          ) : null}

          <p
            role="status"
            aria-live="polite"
            className={cn(
              'text-center text-sm',
              postureFault || blockingWarning
                ? 'font-medium text-destructive cam-full:text-red-300'
                : 'text-muted-foreground cam-full:text-white/85',
            )}
          >
            {statusText}
          </p>
        </>
      }
      controls={
        flow === 'idle' ? (
          <Button disabled={!cameraReady || !poseReady} onClick={handleBegin}>
            <Volume2 className="size-4" /> {!cameraReady || !poseReady ? 'Preparing…' : 'Enable voice & begin'}
          </Button>
        ) : recording ? (
          <Button variant="destructive" onClick={handleStop}>
            <Square className="size-4" /> Stop recording
          </Button>
        ) : null
      }
    >
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
        <div className="h-5/6 w-2/3 rounded-2xl border-2 border-dashed border-white/70" />
      </div>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        aria-label="Live camera preview"
        className={cn(CAMERA_FEED_CLASS, 'scale-x-[-1]')}
      />
      <canvas ref={overlayRef} aria-hidden="true" className={cn(CAMERA_OVERLAY_CLASS, 'scale-x-[-1]')} />

      {/* Big 5→1 count-in overlay. Fluid size so it can't overflow a 320px screen. */}
      {flow === 'countdown' && countdown != null ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50">
          <span className="text-[clamp(5rem,30vw,8rem)] font-bold leading-none text-white drop-shadow-lg tabular-nums">
            {countdown}
          </span>
        </div>
      ) : null}
    </CameraStage>
  );
}
