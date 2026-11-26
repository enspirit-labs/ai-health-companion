'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { OctagonX, Square } from 'lucide-react';
import type { PoseLandmarker } from '@mediapipe/tasks-vision';

import { Button } from '@/components/ui/button';
import { CameraStage, CAMERA_FEED_CLASS, CAMERA_OVERLAY_CLASS } from '@/components/camera-stage';
import { MediaErrorState } from '@/components/media-error-state';
import { RegionChecklist } from '@/components/region-checklist';
import { cn } from '@/lib/utils';
import { drawSkeleton, resetSkeletonSmoothing } from '@/lib/cv/draw-pose-overlay';
import { computeArrowHints, drawArrows } from '@/lib/cv/coaching-arrows';
import { classifyFacing, type FacingResult } from '@/lib/cv/facing-direction';
import { FACE_SCAN_GLOW } from '@/lib/cv/face-scan-theme';
import { classifyCameraPitch, type PitchResult } from '@/lib/cv/camera-pitch';
import { PITCH_TOO_HIGH_HINT, PITCH_TOO_LOW_HINT } from '@/lib/cv/guidance-cue';
import { classifyStance, type StanceResult, type StanceVerdict } from '@/lib/cv/leg-stance';
import { analyzeLighting, type LightingResult } from '@/lib/cv/lighting';
import { chooseGuidanceCue } from '@/lib/cv/guidance-cue';
import { getPoseConnections, getPoseLandmarker, type PoseConnection } from '@/lib/cv/pose-loader';
import { classifyPoseVisibility, type Landmark, type PoseVisibilityResult } from '@/lib/cv/pose-visibility';
import {
  ABSENT_CUE_KEY,
  ABSENT_HINT,
  classifyOccupancy,
  CROWDED_CUE_KEY,
  CROWDED_HINT,
  EMPTY_OCCUPANCY,
  type OccupancyResult,
} from '@/lib/cv/occupancy';
import { chooseIdleNudge } from '@/lib/cv/idle-nudge';
import { useSpeechCue } from '@/lib/voice/use-speech-cue';
import {
  formScoreFor,
  HIP_DROP,
  INITIAL_SQUAT_COUNTER_STATE,
  ratingFor,
  updateSquatCounter,
  type SquatCounterState,
} from '@/lib/cv/squat-rep-counter';
import { cameraErrorMessage, requestCameraStream, type MediaAccessError } from '@/lib/media/user-media';

interface Props {
  isSubmitting: boolean;
  onComplete: (result: { repCount: number; formScore: number; durationSeconds: number; rating: string }) => void;
}

interface SessionProps extends Props {
  /** Safety stop — abandons the set without recording anything. */
  onStop: () => void;
}

/** readiness: safety prompt shown before the camera is even requested.
 *  running: the live session (camera, pose tracking, counting).
 *  skipped / stopped: the user opted out or stopped mid-test — nothing is
 *  recorded, so the assessment isn't completed and can't count toward a streak. */
type Stage = 'readiness' | 'running' | 'skipped' | 'stopped';

const SESSION_DURATION_SECONDS = 30;
/** Lighting changes slowly — sampling it a couple of times a second is plenty
 * and far cheaper than every pose-inference tick. */
const LIGHTING_INTERVAL_MS = 500;
/** The user must hold a correct position (framed + facing + lighting OK) this
 * long before the auto-countdown begins — so a brief glance away doesn't
 * false-trigger it. */
const POSITION_HOLD_MS = 1500;
/** Countdown start value spoken before the set begins (5…1). */
const COUNTDOWN_FROM = 5;

/** idle: camera/pose still warming up — nothing to guide yet.
 *  positioning: guiding the user into frame (entered automatically once ready).
 *  countdown: correct position held → counting 5→1 by voice.
 *  counting: the squat set is live. */
type Flow = 'idle' | 'positioning' | 'countdown' | 'counting';

const NO_REGIONS: PoseVisibilityResult = {
  head: false,
  torso: false,
  arms: false,
  legs: false,
  missing: ['head', 'torso', 'arms', 'legs'],
};

const NOT_FACING: FacingResult = { direction: 'unknown', isFacingForward: false };
const PITCH_UNKNOWN: PitchResult = { pitch: 'unknown', isLevelEnough: true };

// Corner-bracket reticle (replaces a plain dashed box) — each entry is the
// positional + two-adjacent-border-side classes for an L-shaped corner mark.
const GUIDE_CORNER_CLASS: Record<'tl' | 'tr' | 'bl' | 'br', string> = {
  tl: 'top-0 left-0 border-t-4 border-l-4 rounded-tl-3xl',
  tr: 'top-0 right-0 border-t-4 border-r-4 rounded-tr-3xl',
  bl: 'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-3xl',
  br: 'bottom-0 right-0 border-b-4 border-r-4 rounded-br-3xl',
};
const GUIDE_CORNERS = Object.keys(GUIDE_CORNER_CLASS) as Array<keyof typeof GUIDE_CORNER_CLASS>;

export function SquatsTest({ isSubmitting, onComplete }: Props) {
  const [stage, setStage] = useState<Stage>('readiness');

  if (stage === 'running') {
    return <SquatsSession isSubmitting={isSubmitting} onComplete={onComplete} onStop={() => setStage('stopped')} />;
  }

  if (stage === 'skipped' || stage === 'stopped') {
    return (
      <section
        role="status"
        aria-labelledby="squats-ended-heading"
        className="flex flex-col items-center gap-4 rounded-2xl border bg-card px-6 py-8 text-center"
      >
        <h2 id="squats-ended-heading" className="text-xl font-semibold">
          {stage === 'skipped' ? 'Squats check skipped' : 'Test stopped'}
        </h2>
        <p className="max-w-prose text-muted-foreground">
          Nothing has been recorded for this check.
          {stage === 'stopped'
            ? ' If you felt unwell, rest now. If it doesn’t pass, talking to a healthcare professional may help.'
            : ''}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild variant="outline">
            <Link href="/assessments">Back to assessments</Link>
          </Button>
          {stage === 'stopped' ? <Button onClick={() => setStage('readiness')}>Start again</Button> : null}
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="squats-readiness-heading"
      className="flex flex-col items-center gap-4 rounded-2xl border bg-card px-6 py-8 text-center"
    >
      <h2 id="squats-readiness-heading" className="text-xl font-semibold">
        Before you start
      </h2>
      <p className="max-w-prose text-muted-foreground">
        This check asks you to do squats for {SESSION_DURATION_SECONDS} seconds. Only do it if you feel well enough.
      </p>
      <p className="max-w-prose font-medium">
        Stop straight away if you feel pain, dizziness or chest discomfort. A Stop button stays on screen for the
        whole test.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={() => setStage('running')}>Start</Button>
        <Button variant="outline" onClick={() => setStage('skipped')}>
          Skip this check
        </Button>
      </div>
    </section>
  );
}

function SquatsSession({ isSubmitting, onComplete, onStop }: SessionProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const connectionsRef = useRef<PoseConnection[] | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const squatStateRef = useRef<SquatCounterState>(INITIAL_SQUAT_COUNTER_STATE);
  const finishedRef = useRef(false);
  const elapsedSecondsRef = useRef(0);
  // Flow state machine — mirrored to `flow` state for render, held in a ref for
  // the rAF loop (which must read the current value without re-subscribing).
  const flowRef = useRef<Flow>('idle');
  // When the correct position was first held continuously; null when not held.
  const positionHeldSinceRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Guidance (lighting + voice) — separate from anything the rep counter uses.
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastLightingAtRef = useRef(-1);
  const lightingRef = useRef<LightingResult | null>(null);
  // Stance result computed once during the draw pass, reused by the counting
  // logic so classifyStance isn't run twice per frame.
  const stanceRef = useRef<StanceResult | null>(null);
  // Who's in frame this instant. Held in a ref as well as state because the
  // rAF loop gates counting on it and can't wait for a re-render.
  const occupancyRef = useRef<OccupancyResult>(EMPTY_OCCUPANCY);
  // When the user was last actually squatting — set at the start of the set and
  // refreshed on every completed rep. Drives the idle motivation nudges.
  const lastActivityAtRef = useRef<number | null>(null);
  const secondsLeftRef = useRef(SESSION_DURATION_SECONDS);

  const [cameraError, setCameraError] = useState<MediaAccessError | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [poseReady, setPoseReady] = useState(false);
  const [flow, setFlow] = useState<Flow>('idle');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [regions, setRegions] = useState<PoseVisibilityResult>(NO_REGIONS);
  const [facing, setFacing] = useState<FacingResult>(NOT_FACING);
  const [pitch, setPitch] = useState<PitchResult>(PITCH_UNKNOWN);
  const [squatPhase, setSquatPhase] = useState<'up' | 'down'>('up');
  const [stance, setStance] = useState<StanceVerdict>('unknown');
  const [repCount, setRepCount] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(SESSION_DURATION_SECONDS);
  const [lighting, setLighting] = useState<LightingResult | null>(null);
  const [occupancy, setOccupancy] = useState<OccupancyResult>(EMPTY_OCCUPANCY);
  // Current motivational prompt while the user is idle mid-set; null when they
  // are actively squatting.
  const [idleNudge, setIdleNudge] = useState<string | null>(null);
  // This frame's live squat depth (0 = standing, 1 = at the counting
  // threshold) — the same signal the counter itself uses (SquatCounterState's
  // liveDrop), just normalized for a real-time progress ring. Purely a
  // readout; never fed back into the counting logic.
  const [liveDepth, setLiveDepth] = useState(0);

  const voice = useSpeechCue();

  const setFlowBoth = useCallback((next: Flow) => {
    flowRef.current = next;
    setFlow(next);
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

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    setIdleNudge(null);
    const state = squatStateRef.current;
    const formScore = formScoreFor(state);
    onComplete({
      repCount: state.repCount,
      formScore,
      durationSeconds: elapsedSecondsRef.current,
      rating: ratingFor(state.repCount, formScore),
    });
  }, [onComplete]);

  // Begins the live squat set: resets the counter, starts the session timer,
  // and switches to the counting phase (the rAF loop then counts reps).
  const beginCounting = useCallback(() => {
    squatStateRef.current = INITIAL_SQUAT_COUNTER_STATE;
    setRepCount(0);
    setSquatPhase('up');
    setLiveDepth(0);
    setSecondsLeft(SESSION_DURATION_SECONDS);
    secondsLeftRef.current = SESSION_DURATION_SECONDS;
    elapsedSecondsRef.current = 0;
    setCountdown(null);
    setIdleNudge(null);
    // Idle timing starts now, so a user who never begins still gets pushed.
    lastActivityAtRef.current = performance.now();
    setFlowBoth('counting');
    voice.sayNow("Let's start");

    timerRef.current = setInterval(() => {
      elapsedSecondsRef.current += 1;
      setSecondsLeft((s) => {
        const next = s - 1;
        secondsLeftRef.current = Math.max(next, 0);
        if (next <= 0) finish();
        return Math.max(next, 0);
      });
    }, 1000);
  }, [finish, voice, setFlowBoth]);

  // Runs the 5→1 spoken countdown, then hands off to counting. If the user
  // leaves position mid-countdown, the rAF loop calls abortCountdown().
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
        beginCounting();
      }
    }, 1000);
  }, [voice, setFlowBoth, beginCounting]);

  const abortCountdown = useCallback(() => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    countdownTimerRef.current = null;
    setCountdown(null);
    positionHeldSinceRef.current = null;
    setFlowBoth('positioning');
  }, [setFlowBoth]);

  // Arm the flow the moment the camera and pose model are both live — starting
  // the assessment IS the user's intent to begin, so there's no second "begin"
  // tap. Positioning guidance takes over from here and the countdown fires on
  // its own once the user holds the right position.
  useEffect(() => {
    if (!cameraReady || !poseReady) return;
    if (flowRef.current !== 'idle') return;
    positionHeldSinceRef.current = null;
    resetSkeletonSmoothing(); // start the overlay's keypoint filter fresh
    setFlowBoth('positioning');
  }, [cameraReady, poseReady, setFlowBoth]);

  // Unlock voice without a dedicated button. Browsers refuse speechSynthesis
  // until the page has seen a user gesture, but the consent/"start assessment"
  // taps that got the user here already satisfy that — they just happened
  // before this component mounted, and the flag isn't readable from JS. So we
  // try immediately, and also latch onto the very next gesture anywhere on the
  // page as a fallback for the reload-straight-into-the-test case.
  useEffect(() => {
    voice.enable();
    if (!voice.supported) return;

    // Not `once`: a gesture can still land before the browser is willing to
    // speak, and `enable()` self-latches only once an utterance genuinely
    // starts — so keep retrying on every gesture. Repeat calls after that are
    // cheap no-ops.
    const prime = () => voice.enable();
    const opts = { capture: true } as const;
    window.addEventListener('pointerdown', prime, opts);
    window.addEventListener('keydown', prime, opts);
    window.addEventListener('touchstart', prime, opts);
    return () => {
      window.removeEventListener('pointerdown', prime, opts);
      window.removeEventListener('keydown', prime, opts);
      window.removeEventListener('touchstart', prime, opts);
    };
    // `voice` methods are stable useCallbacks — prime exactly once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live pose-detection + rep-counting loop. requestAnimationFrame (not
  // setInterval) because detectForVideo requires a monotonically increasing
  // timestamp and rAF auto-pauses on a backgrounded tab.
  useEffect(() => {
    if (!cameraReady || !poseReady) return;

    let stopped = false;
    const overlay = overlayRef.current;

    const step = () => {
      if (stopped) return;
      const video = videoRef.current;
      const landmarker = landmarkerRef.current;
      const connections = connectionsRef.current;

      if (video && overlay && landmarker && connections && video.videoWidth > 0) {
        const now = performance.now();
        // Run inference on EVERY new camera frame — the only gate is "has the
        // video actually advanced", which naturally caps work at the camera's
        // own frame rate and avoids re-running on a frame we've already done.
        //
        // There used to be an additional 60ms throttle here. It was the dominant
        // source of the visible lag: it held the skeleton on a stale pose for up
        // to a full 60ms after the body had moved, which is ~4x the delay the
        // smoothing filter contributes. Dropping it is what makes the overlay
        // track in real time. rAF already yields to the browser, so a slow
        // device degrades by naturally skipping frames rather than queueing.
        const dueForInference = video.currentTime !== lastVideoTimeRef.current;

        if (dueForInference) {
          lastVideoTimeRef.current = video.currentTime;

          const result = landmarker.detectForVideo(video, now);
          // The detector may return several people. Pick the subject (closest
          // to the camera) deliberately rather than trusting index 0, which can
          // jump between bodies from frame to frame.
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
            if (landmarks) {
              drawSkeleton(ctx, landmarks, connections, overlay.width, overlay.height);
              // Coaching arrows over the feed while counting: feet in/out only
              // for a bad stance (too far / too near). No "go lower" depth arrow.
              // Suppressed while crowded — counting is paused then, and an arrow
              // pointing at a possibly-misidentified body would just confuse.
              if (flowRef.current === 'counting' && !crowded) {
                const st = classifyStance(landmarks);
                stanceRef.current = st; // reused by the counting logic below
                const arrows = computeArrowHints({ landmarks, stance: st.verdict, needsDepth: false });
                drawArrows(ctx, arrows, overlay.width, overlay.height);
              }
            }
          }
          const regionResult = classifyPoseVisibility(landmarks);
          setRegions(regionResult);
          const facingResult = classifyFacing(landmarks);
          setFacing(facingResult);
          const pitchResult = classifyCameraPitch(landmarks);
          setPitch(pitchResult);

          // --- Guidance only (lighting + voice) — does NOT affect counting ---
          // Sample lighting on its own slower cadence.
          if (now - lastLightingAtRef.current >= LIGHTING_INTERVAL_MS) {
            lastLightingAtRef.current = now;
            const result = analyzeLighting(sampleLighting(video));
            lightingRef.current = result;
            setLighting(result);
          }
          // Is the user correctly positioned this frame? Present, alone in shot,
          // framed (all regions in view), facing forward, and lighting usable.
          // Occupancy is a hard precondition at both ends: with nobody there the
          // readings below describe no one, and with a bystander present we
          // can't be sure they describe the right person. "Exactly one person"
          // is stated explicitly rather than relying on an empty frame happening
          // to fail the framing check below.
          const positionOk =
            occupancyResult.personCount === 1 &&
            !crowded &&
            regionResult.missing.length === 0 &&
            facingResult.isFacingForward &&
            pitchResult.isLevelEnough &&
            (lightingRef.current?.ok ?? true);

          const phase = flowRef.current;

          if (phase === 'positioning') {
            // Speak the single most important positioning cue (debounced by the
            // voice manager). Once counting/counting-down these would distract.
            const cue = chooseGuidanceCue({
              lighting: lightingRef.current,
              regions: regionResult,
              facing: facingResult,
              started: false,
              occupancy: occupancyResult,
              pitch: pitchResult,
            });
            if (!cue.ok) voice.cue(cue.text, cue.text);

            // Auto-start the countdown once the correct position has been held
            // continuously for POSITION_HOLD_MS.
            if (positionOk) {
              if (positionHeldSinceRef.current == null) positionHeldSinceRef.current = now;
              if (now - positionHeldSinceRef.current >= POSITION_HOLD_MS) {
                positionHeldSinceRef.current = null;
                beginCountdown();
              }
            } else {
              positionHeldSinceRef.current = null;
            }
          } else if (phase === 'countdown') {
            // If the user drifts out of position mid-countdown, cancel and go
            // back to guiding them.
            if (!positionOk) abortCountdown();
          } else if (phase === 'counting') {
            // Someone else walked into shot mid-set. Pause counting entirely:
            // the subject pick can flip to the other person between frames, and
            // a hip-drop measured across that switch would fabricate reps. The
            // counter state is left untouched so the set resumes cleanly (and
            // the session clock keeps running — the user is losing their own
            // time, which is the incentive to clear the frame quickly).
            if (occupancyResult.personCount === 0) {
              // The user has left the shot mid-set. Counting is already
              // impossible without landmarks; call them back rather than
              // falling through to the facing branch below, which would tell an
              // empty frame to "face the camera". Idle nudges are suppressed and
              // the idle timer is held — they can't squat from off-camera, so
              // that time shouldn't count against them.
              setIdleNudge(null);
              lastActivityAtRef.current = now;
              voice.cue(ABSENT_CUE_KEY, ABSENT_HINT);
            } else if (crowded) {
              // Clearing the frame is the priority; suppress the idle nudge and
              // don't hold the pause against the user's idle timer.
              setIdleNudge(null);
              lastActivityAtRef.current = now;
              voice.cue(CROWDED_CUE_KEY, CROWDED_HINT);
            } else if (facingResult.isFacingForward && !pitchResult.isLevelEnough) {
              // Camera angle drifted (e.g. a bumped tripod) mid-set. Checked
              // after facing (a turn also distorts the leg:torso ratio, so
              // facing must be confirmed fine first — matches
              // chooseGuidanceCue's priority order) but before the counting
              // logic below: the hip-drop counter's torso-normalization
              // assumes a roughly level camera, and an extreme pitch breaks
              // that assumption the same way a turn does.
              const pitchMsg = pitchResult.pitch === 'too-high' ? PITCH_TOO_HIGH_HINT : PITCH_TOO_LOW_HINT;
              voice.cue(`pitch-${pitchResult.pitch}`, pitchMsg);
              setIdleNudge(null);
              lastActivityAtRef.current = now;
            } else if (facingResult.isFacingForward) {
              // Pause counting while turned away — a reading taken mid-turn
              // isn't reliable enough to trust for a rep transition. The
              // counter uses calibrated hip-drop internally.
              // Reuse the stance verdict already computed in the draw pass this
              // frame (falls back to a fresh compute if somehow unset).
              const st = stanceRef.current ?? classifyStance(landmarks);
              setStance(st.verdict);

              // Stance gates the rep ONLY while the user is standing. Mid-squat
              // the ratio it measures (ankle gap ÷ shoulder width) is not a
              // stance signal at all: the feet stay planted, but the shoulders
              // narrow in 2D projection as the torso leans forward, so the ratio
              // drifts past `maxRatio` on the way down. That was disqualifying
              // perfectly good reps for a "wide stance" the user never adopted.
              // Judging only at the top keeps the check honest — a genuinely
              // wide stance is still caught before the descent begins.
              const prev = squatStateRef.current;
              const standing = prev.phase === 'up';
              const formOk = !standing || st.verdict === 'ok' || st.verdict === 'unknown';

              // Warn the moment bad form appears, without waiting for the rep to
              // finish (voice manager debounces + rate-limits, so no spam).
              // Suppressed mid-descent for the same reason the gate is: the
              // verdict isn't meaningful there, so speaking it would misinform.
              if (st.hint && standing) voice.cue(st.verdict, st.hint);

              const next = updateSquatCounter(prev, landmarks, now, formOk);
              squatStateRef.current = next;
              setSquatPhase(next.phase);
              setRepCount(next.repCount);
              setLiveDepth(Math.min(1, next.liveDrop / HIP_DROP.depth));

              // React once to the just-completed rep.
              if (next.lastOutcome?.kind === 'counted') {
                voice.sayNow(String(next.repCount));
              } else if (next.lastOutcome?.kind === 'rejected') {
                const msg =
                  next.lastOutcome.reason === 'shallow'
                    ? 'Go a bit lower next time'
                    : next.lastOutcome.reason === 'stance'
                      ? 'Fix your stance — that one didn’t count'
                      : 'Slow it down — that one didn’t count';
                voice.cue(`rejected-${next.lastOutcome.reason}`, msg);
              }

              // --- Motivate a user who has started but isn't squatting -------
              // Any closed attempt counts as activity, even a rejected one: the
              // user IS trying, and a "go lower" cue has already been given —
              // piling a "start squatting!" nudge on top would be wrong.
              if (next.lastOutcome != null) {
                lastActivityAtRef.current = now;
              }
              if (lastActivityAtRef.current == null) lastActivityAtRef.current = now;
              const nudge = chooseIdleNudge({
                idleForMs: now - lastActivityAtRef.current,
                // Mid-descent means they're working — never nudge over the top
                // of an in-progress squat.
                isDescending: next.phase === 'down',
                repCount: next.repCount,
                secondsLeft: secondsLeftRef.current,
              });
              setIdleNudge(nudge?.text ?? null);
              if (nudge) voice.cue(nudge.key, nudge.text);
            } else {
              // Turned side-on / away mid-set: counting is paused, so coach the
              // user back to facing the camera. The correction names the way to
              // turn — if they've rotated to their right, tell them to turn
              // left, and vice-versa. Voice manager debounces + rate-limits.
              // Mirrored (selfie) feed: turn the SAME side the detector reports.
              const facingMsg =
                facingResult.direction === 'right'
                  ? 'Turn to your right and face the camera'
                  : facingResult.direction === 'left'
                    ? 'Turn to your left and face the camera'
                    : facingResult.direction === 'back'
                      ? 'Turn around and face the camera'
                      : 'Face the camera to keep counting';
              voice.cue(`facing-${facingResult.direction}`, facingMsg);
              // Facing the camera comes first; don't stack an idle nudge on top,
              // and don't penalise the paused time.
              setIdleNudge(null);
              lastActivityAtRef.current = now;
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
    };
    // `voice` methods are stable useCallbacks; excluding it keeps the rAF loop
    // from being torn down and rebuilt on unrelated re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraReady, poseReady]);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      // Silence any in-flight or queued speech on the way out. speechSynthesis
      // is a global that outlives this component, so without this a cue spoken
      // just as the user navigates away keeps talking over the next screen.
      voice.stop();
    },
    // `voice.stop` is a stable useCallback — this must run on unmount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  if (cameraError) {
    return <MediaErrorState error={cameraError} />;
  }

  const showFacingWarning = regions.torso && !facing.isFacingForward;
  // Only surfaced once facing is fine — a turn also distorts the leg:torso
  // ratio the pitch check relies on, matching chooseGuidanceCue's ordering.
  const showPitchWarning = regions.torso && facing.isFacingForward && !pitch.isLevelEnough;
  const pitchHint = pitch.pitch === 'too-high' ? PITCH_TOO_HIGH_HINT : PITCH_TOO_LOW_HINT;
  // Lighting is the most blocking problem — surface its hint above framing.
  const lightingWarning = lighting && !lighting.ok ? lighting.hint : null;
  const counting = flow === 'counting';
  const setup = flow !== 'counting';
  // The guide reticle reads "active" (amber) once the countdown starts and
  // for the rest of the set — "waiting" (neutral) only while still getting
  // positioned.
  const isActiveGuide = flow === 'countdown' || counting;
  // Extra people outrank every other warning, and unlike the setup-only cues it
  // stays visible during the set too — that's exactly when a bystander wandering
  // in does the most damage.
  const crowdedWarning = occupancy.crowded && flow !== 'idle';
  // Nobody in shot. Outranks even the crowded warning (they're mutually
  // exclusive anyway) and, like it, stays up during the set — walking out of
  // frame mid-set is exactly when the user needs calling back. Suppressed while
  // idle, where "no pose yet" just means the model hasn't warmed up.
  const absentWarning = occupancy.personCount === 0 && flow !== 'idle';
  // Someone IS in shot but only part of them fits — the classic "cut off at the
  // knees" framing. Treated as an error (red), not a soft warning: the missing
  // regions are exactly the ones the rep counter needs, so the assessment
  // genuinely cannot proceed. Distinct from `absentWarning`, where nobody is
  // there at all and "step back" would be the wrong advice.
  const partialWarning = !absentWarning && occupancy.personCount > 0 && regions.missing.length > 0 && flow !== 'idle';
  const partialHint = `Move back — I can't see your ${regions.missing.join(', ')}`;

  // Stance coaching text shown while counting (null when fine/unknown). Only
  // while standing, matching the rep gate: mid-descent the stance ratio isn't
  // measurable (see the counting loop), so showing it would contradict the gate
  // and tell the user to fix feet that are already correct.
  const stanceHint = squatPhase !== 'up' ? null :
    stance === 'too-narrow'
      ? 'Move your feet a little further apart'
      : stance === 'too-wide'
        ? 'Bring your feet a little closer together'
        : null;

  // The single big status line shown in the right panel.
  // Priority order mirrors chooseGuidanceCue: hardware readiness, then who's in
  // frame (absent before crowded before any body-derived reading), then the
  // setup-only position problems, then mid-set coaching. Written as early
  // returns rather than a ternary chain — at this length the nesting obscured
  // exactly the ordering that matters most here.
  function currentStatusText(): string {
    if (!cameraReady) return 'Starting camera…';
    if (!poseReady) return 'Loading pose tracking…';
    // Nobody / too many people first: every cue below describes a body we
    // either don't have or can't reliably identify.
    if (absentWarning) return ABSENT_HINT;
    if (crowdedWarning) return CROWDED_HINT;
    // Partly out of frame — named regions, and NOT gated on `setup`: getting
    // cut off mid-set is exactly when the user needs telling, and the counter
    // is blocked on the same missing landmarks either way.
    if (partialWarning) return partialHint;
    if (flow === 'countdown') return 'Hold still — starting…';
    if (setup) {
      if (lightingWarning) return lightingWarning;
      if (showFacingWarning) return 'Turn to face the camera straight on';
      if (showPitchWarning) return pitchHint;
    }
    if (flow === 'positioning') return 'Great — hold that position, counting you in…';
    if (flow === 'idle') return 'Getting ready…';
    if (idleNudge) return idleNudge;
    if (stanceHint) return stanceHint;
    return squatPhase === 'down' ? 'Down — now stand back up' : 'Keep going — one squat at a time';
  }

  const statusText = currentStatusText();

  return (
    <CameraStage
      className={cn(
        (showFacingWarning || showPitchWarning) &&
          setup &&
          !crowdedWarning &&
          !absentWarning &&
          !partialWarning &&
          'ring-4 ring-status-warning',
        // Red for every "we can't assess you right now" state: nobody there,
        // too many people, or only part of the body in frame.
        (crowdedWarning || absentWarning || partialWarning) && 'ring-4 ring-status-critical',
      )}
      // Top-pinned warning strip. Priority order: nobody in frame outranks
      // everything, then extra people (both invalidate every other reading),
      // then setup-only position problems, then mid-set coaching.
      banner={
        absentWarning ? (
          <div className="bg-status-critical px-3 py-2 text-center text-sm font-semibold text-white">{ABSENT_HINT}</div>
        ) : crowdedWarning ? (
          <div className="bg-status-critical px-3 py-2 text-center text-sm font-semibold text-white">{CROWDED_HINT}</div>
        ) : /* Only part of the body in frame — red, and shown during the set as
              well as setup, since the counter is blocked either way. */
        partialWarning ? (
          <div className="bg-status-critical px-3 py-2 text-center text-sm font-semibold text-white">{partialHint}</div>
        ) : /* Position warnings only matter while getting set up. */
        setup && lightingWarning ? (
          <div className="bg-status-warning px-3 py-2 text-center text-sm font-semibold text-black">
            {lightingWarning}
          </div>
        ) : setup && showFacingWarning ? (
          <div className="bg-status-warning px-3 py-2 text-center text-sm font-semibold text-black">
            Face the camera directly
          </div>
        ) : setup && showPitchWarning ? (
          <div className="bg-status-warning px-3 py-2 text-center text-sm font-semibold text-black">{pitchHint}</div>
        ) : /* Motivational push when the user has stalled mid-set. Ranks above
              stance coaching: if they aren't moving at all, foot placement is
              not the thing to fix. */
        counting && idleNudge ? (
          <div className="bg-primary px-3 py-2 text-center text-sm font-bold text-primary-foreground">{idleNudge}</div>
        ) : counting && stanceHint ? (
          <div className="bg-status-warning px-3 py-2 text-center text-sm font-semibold text-black">{stanceHint}</div>
        ) : null
      }
      // Guidance surface: overlaid on the feed below lg, a real side-by-side
      // panel at lg+. Squats keeps its actions in here rather than in
      // `controls`, matching the original two-panel composition.
      panel={
        <>
          <p className="text-xl font-bold leading-tight sm:text-2xl lg:text-3xl">{statusText}</p>

          {setup ? (
            <RegionChecklist
              items={[
                { key: 'head', label: 'Head', confirmed: regions.head },
                { key: 'torso', label: 'Torso', confirmed: regions.torso },
                { key: 'arms', label: 'Arms', confirmed: regions.arms },
                { key: 'legs', label: 'Legs', confirmed: regions.legs },
              ]}
            />
          ) : null}

          {/* Large count-in number mirrored on the guidance panel too. Fluid so
              it cannot overflow a 320px viewport. */}
          {flow === 'countdown' && countdown != null ? (
            <span className="text-[clamp(4rem,22vw,10rem)] font-bold leading-none tabular-nums text-primary max-lg:text-white">
              {countdown}
            </span>
          ) : null}

          {counting ? (
            <div className="flex flex-col items-center gap-1">
              {/* Live depth-progress ring — fills from 0 at standing to full
                  at the same HIP_DROP.depth threshold the counter itself
                  uses, so this is a real-time readout of the actual signal,
                  not a decorative animation. */}
              <div className="relative flex size-40 items-center justify-center sm:size-48 lg:size-56">
                <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden="true">
                  <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="5" />
                  <circle
                    cx="50"
                    cy="50"
                    r="44"
                    fill="none"
                    stroke="#E8B074"
                    strokeWidth="5"
                    strokeLinecap="round"
                    pathLength={100}
                    strokeDasharray="100"
                    strokeDashoffset={100 - liveDepth * 100}
                    className="transition-[stroke-dashoffset] duration-150 ease-out"
                  />
                </svg>
                <span
                  key={repCount}
                  className="text-[clamp(3.5rem,16vw,7rem)] font-bold leading-none tabular-nums text-primary max-lg:text-white [animation:faceScanCountdownTick_0.4s_ease-out]"
                >
                  {repCount}
                </span>
              </div>
              <span className="text-xl font-semibold text-muted-foreground max-lg:text-white/80 lg:text-2xl">
                squats
              </span>
              <span className="mt-1 text-base text-muted-foreground max-lg:text-white/80 lg:text-lg">
                {secondsLeft}s left
              </span>
            </div>
          ) : null}

          {counting ? (
            <Button variant="secondary" disabled={isSubmitting} onClick={finish}>
              <Square className="size-4" /> Finish now
            </Button>
          ) : null}

          {/* Safety stop — visible through every phase of the test, and never
              disabled: it abandons the set without recording a result. */}
          <Button variant="destructive" onClick={onStop}>
            <OctagonX className="size-4" /> Stop
          </Button>
        </>
      }
    >
      {/* Framing guide: corner-bracket reticle + ambient glow, tracking the
          full visible feed (inset-1, not a narrower centered box) so it shows
          where the camera actually sees rather than an arbitrary crop inside
          it — the small inset keeps every mark on screen (inset-0 lands
          exactly on the overflow-hidden boundary and clips). Soft black
          rather than white in the neutral state: against a typically bright
          indoor wall a white mark washed out and competed with the green
          skeleton. */}
      <div className="pointer-events-none absolute inset-1 z-10">
        <div
          className="absolute -inset-8 rounded-[3rem] blur-3xl transition-[background,opacity] duration-500 ease-out"
          style={{
            background: `radial-gradient(ellipse at center, ${isActiveGuide ? FACE_SCAN_GLOW.scanning : FACE_SCAN_GLOW.waiting} 0%, transparent 72%)`,
            opacity: isActiveGuide ? 0.55 : 0.3,
          }}
        />
        {GUIDE_CORNERS.map((corner) => (
          <span
            key={corner}
            className={cn(
              'absolute size-12 rounded-3xl transition-colors duration-500',
              GUIDE_CORNER_CLASS[corner],
              isActiveGuide ? 'border-amber-200/80' : 'border-black/50',
            )}
          />
        ))}
      </div>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        aria-label="Live camera preview"
        className={cn(CAMERA_FEED_CLASS, 'scale-x-[-1]')}
      />
      <canvas ref={overlayRef} className={cn(CAMERA_OVERLAY_CLASS, 'scale-x-[-1]')} />

      {/* Big 5→1 count-in overlay. */}
      {flow === 'countdown' && countdown != null ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50">
          <span className="text-[clamp(5rem,32vw,12rem)] font-bold leading-none text-white drop-shadow-lg tabular-nums">
            {countdown}
          </span>
        </div>
      ) : null}
    </CameraStage>
  );
}
