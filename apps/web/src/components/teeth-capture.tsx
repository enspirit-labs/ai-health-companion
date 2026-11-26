'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, RotateCcw } from 'lucide-react';
import type { FaceLandmarker } from '@mediapipe/tasks-vision';

import { Button } from '@/components/ui/button';
import { CameraStage, CAMERA_FEED_CLASS } from '@/components/camera-stage';
import { MediaErrorState } from '@/components/media-error-state';
import { cn } from '@/lib/utils';
import { CaptureSuccessBurst } from '@/components/face-assessment/capture-countdown';
import { FaceScanFrame } from '@/components/face-assessment/face-scan-frame';
import { FaceScanLoading } from '@/components/face-assessment/face-scan-loading';
import { FaceScanTopBar } from '@/components/face-assessment/face-scan-topbar';
import { GuidanceToast, useGuidanceToast } from '@/components/face-assessment/guidance-toast';
import { FACE_LM, mouthBoundingBox, type FaceLandmark } from '@/lib/cv/face-framing';
import { getFaceLandmarker } from '@/lib/cv/face-landmarker-loader';
import type { PixelFrame } from '@/lib/cv/frame-quality';
import type { FaceScanState } from '@/lib/cv/face-scan-theme';
import { evaluateTeethCaptureFrame, type TeethCaptureEvaluation } from '@/lib/cv/teeth-capture-guidance';
import { cameraErrorMessage, requestCameraStream, type MediaAccessError } from '@/lib/media/user-media';
import { INITIAL_VOICE_GUIDANCE_STATE, speak, speakGuidance, stopSpeaking, type VoiceGuidanceState } from '@/lib/media/voice-guidance';

interface Props {
  isSubmitting: boolean;
  onCapture: (blob: Blob) => void;
}

// Throttles FaceLandmarker inference — matches face-capture.tsx's cadence.
const INFER_INTERVAL_MS = 150;
// Lighting/sharpness don't need per-tick freshness; sampled far less often
// than geometric checks to avoid reading full pixel data 6-7x/second.
const QUALITY_SNAPSHOT_INTERVAL_MS = 500;
// Downscaled square used for both the periodic and the post-capture pixel
// snapshot, so `frame-quality.ts` thresholds are compared on a consistent scale.
const QUALITY_SNAPSHOT_SIZE = 160;
const MOVEMENT_HISTORY_SIZE = 5;
// How long canCapture must hold true, continuously, before auto-capturing —
// long enough that a single lucky frame (given ~150ms between inference
// ticks) can't fire it, short enough that it still feels immediate.
const AUTO_CAPTURE_HOLD_MS = 700;

// Requests 720p rather than the app-wide 640x480 default — the spec calls
// for flagging sub-720p capture.
const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
  audio: false,
};

function captureDownscaledFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): PixelFrame | undefined {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return undefined;
  ctx.drawImage(video, 0, 0, QUALITY_SNAPSHOT_SIZE, QUALITY_SNAPSHOT_SIZE);
  const imageData = ctx.getImageData(0, 0, QUALITY_SNAPSHOT_SIZE, QUALITY_SNAPSHOT_SIZE);
  return { data: imageData.data, width: imageData.width, height: imageData.height };
}

export function TeethCapture({ isSubmitting, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const snapshotCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const lastInferAtRef = useRef(-1);
  const lastTimestampRef = useRef(-1);
  const lastSnapshotAtRef = useRef(-1);
  const pixelFrameRef = useRef<PixelFrame | undefined>(undefined);
  const centroidHistoryRef = useRef<FaceLandmark[]>([]);
  const latestLandmarksRef = useRef<FaceLandmark[] | undefined>(undefined);
  const latestFaceCountRef = useRef(0);
  const latestMovementDeltaRef = useRef<number | undefined>(undefined);
  const voiceStateRef = useRef<VoiceGuidanceState>(INITIAL_VOICE_GUIDANCE_STATE);
  const justCapturedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoCaptureReadySinceRef = useRef<number | null>(null);
  const autoCaptureFiredRef = useRef(false);
  // Lets the validation loop below call the latest handleCapture without
  // needing it (declared further down, after the loop) in its effect deps.
  const handleCaptureRef = useRef<() => void>(() => {});

  const [cameraError, setCameraError] = useState<MediaAccessError | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [landmarkerReady, setLandmarkerReady] = useState(false);
  const [evaluation, setEvaluation] = useState<TeethCaptureEvaluation | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [retakeReason, setRetakeReason] = useState<string | null>(null);
  const [justCaptured, setJustCaptured] = useState(false);
  // Whether the most recent inference tick found a face at all — distinct
  // from landmarkerReady (the model finished loading). Drives the premium
  // scan UI's guide state, same as face-mesh-capture.tsx's hasFace.
  const [hasFace, setHasFace] = useState(false);
  // Real mouth-center landmark position for the scanning-highlight marker —
  // purely cosmetic positioning, not fed into any pass/fail logic.
  const [mouthAnchor, setMouthAnchor] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let cancelled = false;

    speakGuidance(voiceStateRef, 'Please allow camera access.', performance.now());
    requestCameraStream(CAMERA_CONSTRAINTS)
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
    let cancelled = false;
    getFaceLandmarker()
      .then((landmarker) => {
        if (cancelled) return;
        landmarkerRef.current = landmarker;
        setLandmarkerReady(true);
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

  useEffect(() => {
    if (cameraReady && landmarkerReady && !capturedBlob) {
      speakGuidance(voiceStateRef, 'Position your face inside the frame.', performance.now());
    }
  }, [cameraReady, landmarkerReady, capturedBlob]);

  useEffect(
    () => () => {
      if (justCapturedTimeoutRef.current) clearTimeout(justCapturedTimeoutRef.current);
    },
    [],
  );

  // Live validation loop — requestAnimationFrame (not setInterval) because
  // detectForVideo needs a monotonically increasing timestamp and rAF
  // auto-pauses on a backgrounded tab, same as face-capture.tsx/squats-test.tsx.
  useEffect(() => {
    if (!cameraReady || !landmarkerReady || capturedBlob) return;

    let stopped = false;
    if (!snapshotCanvasRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = QUALITY_SNAPSHOT_SIZE;
      canvas.height = QUALITY_SNAPSHOT_SIZE;
      snapshotCanvasRef.current = canvas;
    }

    const step = () => {
      if (stopped) return;
      const video = videoRef.current;
      const landmarker = landmarkerRef.current;

      if (video && landmarker && video.videoWidth > 0) {
        const now = performance.now();
        const dueForInference =
          now - lastInferAtRef.current >= INFER_INTERVAL_MS && video.currentTime !== lastVideoTimeRef.current && now > lastTimestampRef.current;

        if (dueForInference) {
          lastVideoTimeRef.current = video.currentTime;
          lastInferAtRef.current = now;
          lastTimestampRef.current = now;

          const result = landmarker.detectForVideo(video, now);
          const landmarks = result.faceLandmarks[0] as FaceLandmark[] | undefined;
          const faceCount = result.faceLandmarks.length;
          latestLandmarksRef.current = landmarks;
          latestFaceCountRef.current = faceCount;

          const foundFace = Boolean(landmarks);
          setHasFace((prev) => (prev === foundFace ? prev : foundFace));
          const mouth = landmarks ? mouthBoundingBox(landmarks) : null;
          setMouthAnchor(mouth ? { x: (mouth.minX + mouth.maxX) / 2, y: (mouth.minY + mouth.maxY) / 2 } : null);

          let movementDelta: number | undefined;
          if (landmarks) {
            const centroid = landmarks[FACE_LM.nose[0]];
            const history = centroidHistoryRef.current;
            history.push(centroid);
            if (history.length > MOVEMENT_HISTORY_SIZE) history.shift();
            if (history.length >= MOVEMENT_HISTORY_SIZE) {
              const oldest = history[0];
              movementDelta = Math.hypot(centroid.x - oldest.x, centroid.y - oldest.y);
            }
          } else {
            centroidHistoryRef.current = [];
          }
          latestMovementDeltaRef.current = movementDelta;

          if (snapshotCanvasRef.current && now - lastSnapshotAtRef.current >= QUALITY_SNAPSHOT_INTERVAL_MS) {
            lastSnapshotAtRef.current = now;
            pixelFrameRef.current = captureDownscaledFrame(video, snapshotCanvasRef.current);
          }

          const evaluationInput = {
            faceCount,
            landmarks,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            pixelFrame: pixelFrameRef.current,
            movementDelta,
          };
          const nextEvaluation = evaluateTeethCaptureFrame(evaluationInput);
          setEvaluation(nextEvaluation);
          speakGuidance(voiceStateRef, nextEvaluation.instruction, now);

          if (nextEvaluation.canCapture) {
            if (autoCaptureReadySinceRef.current === null) {
              autoCaptureReadySinceRef.current = now;
            } else if (!autoCaptureFiredRef.current && now - autoCaptureReadySinceRef.current >= AUTO_CAPTURE_HOLD_MS) {
              handleCaptureRef.current();
            }
          } else {
            autoCaptureReadySinceRef.current = null;
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
  }, [cameraReady, landmarkerReady, capturedBlob]);

  const handleCapture = useCallback(() => {
    // Marks the auto-capture hold as "spent" regardless of what triggered
    // this call (the button or the auto-capture timer itself), so a step()
    // tick that fires between this call and capturedBlob actually updating
    // can't also trigger a second, overlapping capture from the same hold.
    autoCaptureFiredRef.current = true;

    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    // Revalidates against a FRESH snapshot taken at the moment of capture,
    // rather than trusting the (possibly ~150ms-old) live evaluation state —
    // catches a blink/flinch/motion-blur that happened between the last live
    // tick and the actual click. Geometric checks reuse the last live
    // detection (this canvas IS that exact video frame); only the pixel
    // checks (lighting/sharpness) are re-run fresh, since a second
    // FaceLandmarker in IMAGE mode just to re-detect a still we already have
    // landmarks for isn't worth the added complexity.
    const freshFrame = snapshotCanvasRef.current
      ? captureDownscaledFrame(video, snapshotCanvasRef.current)
      : pixelFrameRef.current;

    const revalidation = evaluateTeethCaptureFrame({
      faceCount: latestFaceCountRef.current,
      landmarks: latestLandmarksRef.current,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      pixelFrame: freshFrame,
      movementDelta: latestMovementDeltaRef.current,
    });

    if (!revalidation.canCapture) {
      setRetakeReason(revalidation.instruction);
      // Lets auto-capture retry: this was a last-instant failure (e.g. a
      // blink) the live loop's throttled evaluation didn't catch, so require
      // a fresh full hold before trying again rather than firing right back.
      autoCaptureReadySinceRef.current = null;
      autoCaptureFiredRef.current = false;
      return;
    }

    setRetakeReason(null);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setCapturedBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
        streamRef.current?.getTracks().forEach((t) => t.stop());

        speak('Image captured successfully. Analyzing your teeth…');
        setJustCaptured(true);
        if (justCapturedTimeoutRef.current) clearTimeout(justCapturedTimeoutRef.current);
        justCapturedTimeoutRef.current = setTimeout(() => setJustCaptured(false), 2500);
      },
      'image/jpeg',
      0.9,
    );
  }, []);

  useEffect(() => {
    handleCaptureRef.current = handleCapture;
  }, [handleCapture]);

  const handleRetake = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setCapturedBlob(null);
    setRetakeReason(null);
    if (justCapturedTimeoutRef.current) clearTimeout(justCapturedTimeoutRef.current);
    setJustCaptured(false);
    setHasFace(false);
    setMouthAnchor(null);
    autoCaptureReadySinceRef.current = null;
    autoCaptureFiredRef.current = false;
    // Stop the outgoing stream before requesting a new one — otherwise the
    // old getUserMedia capture is just dropped, leaving the camera running
    // in the background (hardware indicator stays on) indefinitely.
    streamRef.current?.getTracks().forEach((t) => t.stop());
    requestCameraStream(CAMERA_CONSTRAINTS)
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch((error: unknown) => setCameraError(cameraErrorMessage(error)));
  }, [previewUrl]);

  const systemReady = cameraReady && landmarkerReady;
  const canCapture = Boolean(evaluation?.canCapture);
  const guidanceToast = useGuidanceToast(evaluation && !evaluation.canCapture ? evaluation.instruction : null);

  const guideState: FaceScanState = justCaptured || canCapture ? 'success' : !hasFace ? 'waiting' : evaluation && !evaluation.canCapture ? 'error' : 'scanning';

  // Single aggregate "Teeth visible" indicator, replacing the old 5-chip
  // breakdown (Face/Mouth/Distance/Light/Stable) — visual simplification
  // only. Every underlying check (evaluateTeethCaptureFrame, still called
  // above) keeps gating capture exactly as before; canCapture already IS
  // the combined verdict across all of them, so it drives this directly —
  // it can't go green while any one check (including blur/lighting) is
  // still failing, since canCapture itself wouldn't be true yet.
  const teethVisible = canCapture || justCaptured;
  const statusLabel = teethVisible
    ? 'Teeth visible'
    : !systemReady
      ? 'Initializing…'
      : evaluation?.instruction ?? 'Position your mouth in view.';
  // 'waiting' (neutral, not yet actively rejecting anything — model/camera
  // still loading) is distinct from 'bad' (red — a real, current reason to
  // fix something) so the dot doesn't flash red before any check has even run.
  const statusDotState: 'waiting' | 'good' | 'bad' = teethVisible ? 'good' : !systemReady ? 'waiting' : 'bad';

  if (cameraError) {
    return <MediaErrorState error={cameraError} />;
  }

  if (capturedBlob && previewUrl) {
    return (
      <CameraStage
        onExit={handleRetake}
        status={
          justCaptured ? (
            <p className="text-sm text-status-good">Image captured successfully. Analyzing your teeth…</p>
          ) : retakeReason ? (
            <p className="text-sm text-status-warning">{retakeReason}</p>
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
            true (non-mirrored) orientation, since teeth get charted by
            left/right position. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt="Captured photo of teeth"
          className={cn(CAMERA_FEED_CLASS, 'scale-x-[-1]')}
        />
        {justCaptured ? <CaptureSuccessBurst /> : null}
      </CameraStage>
    );
  }

  return (
    <CameraStage
      status={
        <div className="flex w-full flex-col items-center gap-2">
          <div className="flex items-center gap-2 rounded-full bg-black/20 px-4 py-2 backdrop-blur-sm">
            <span
              className={cn(
                'size-3 shrink-0 rounded-full transition-colors duration-300',
                statusDotState === 'good'
                  ? 'bg-status-good shadow-[0_0_8px_2px_rgba(12,163,12,0.55)]'
                  : statusDotState === 'bad'
                    ? 'bg-destructive'
                    : 'bg-white/30',
              )}
              aria-hidden="true"
            />
            <span className={cn('text-sm font-medium', statusDotState === 'good' ? 'text-status-good' : 'text-white')}>{statusLabel}</span>
          </div>
          {/* Live region for screen readers — the dot above is purely visual. */}
          <p className="sr-only" role="status">
            {teethVisible ? 'Teeth visible — ready to capture.' : statusLabel}
          </p>
        </div>
      }
      controls={
        <Button disabled={!canCapture} onClick={handleCapture}>
          <Camera className="size-4" /> Capture photo
        </Button>
      }
    >
      <FaceScanFrame state={guideState} />
      <FaceScanTopBar active={systemReady && !justCaptured} label={systemReady && hasFace ? 'Mouth Area' : undefined} />
      {mouthAnchor ? (
        <div className="pointer-events-none absolute inset-0 z-10">
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${(1 - mouthAnchor.x) * 100}%`, top: `${mouthAnchor.y * 100}%` }}
          >
            <span className="absolute -inset-2 rounded-full border border-amber-200/50 [animation:pulseRing_1.6s_ease-out_infinite]" />
            <span className="relative block size-2 rounded-full bg-amber-200 shadow-[0_0_8px_2px_rgba(246,217,174,0.75)]" />
          </div>
        </div>
      ) : null}
      <GuidanceToast message={guidanceToast} />
      {!systemReady ? <FaceScanLoading cameraReady={cameraReady} /> : null}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        aria-label="Live camera preview"
        className={cn(CAMERA_FEED_CLASS, 'scale-x-[-1]')}
      />
    </CameraStage>
  );
}
