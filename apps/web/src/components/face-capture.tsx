'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { CameraStage, CAMERA_FEED_CLASS } from '@/components/camera-stage';
import { MediaErrorState } from '@/components/media-error-state';
import { FaceScanFrame } from '@/components/face-assessment/face-scan-frame';
import { FaceScanTopBar } from '@/components/face-assessment/face-scan-topbar';
import { CaptureCountdown, CaptureSuccessBurst } from '@/components/face-assessment/capture-countdown';
import { GuidanceToast, useGuidanceToast } from '@/components/face-assessment/guidance-toast';
import type { FaceScanState } from '@/lib/cv/face-scan-theme';
import { cn } from '@/lib/utils';
import { getFaceDetector } from '@/lib/cv/face-detector-loader';
import { cameraErrorMessage, requestCameraStream } from '@/lib/media/user-media';
import { useMediaStream } from '@/lib/media/use-media-stream';
import type { FaceDetector } from '@mediapipe/tasks-vision';

interface Props {
  isSubmitting: boolean;
  onCapture: (blob: Blob) => void;
  /** Overrides the heading shown above the capture frame, e.g. "Look left". */
  promptText?: string;
}

// Throttles inference rather than running every rAF tick — guidance text
// doesn't need per-frame updates, and this keeps CPU/battery reasonable.
const INFER_INTERVAL_MS = 150;
const JUST_CAPTURED_DURATION_MS = 2500;
// Visible "3 2 1" beat once the user taps Capture — shares Face/Eye's
// CaptureCountdown component, but started by the button click rather than a
// face-landmark gate: this screen also captures non-facial skin patches, so
// it can never require a face to be present at all.
const CAPTURE_COUNTDOWN_SECONDS = 3;

export function FaceCapture({ isSubmitting, onCapture, promptText }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const detectorRef = useRef<FaceDetector | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const lastInferAtRef = useRef(-1);
  const lastTimestampRef = useRef(-1);
  const justCapturedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    streamRef,
    ready: cameraReady,
    error: cameraError,
    restart: restartCameraStream,
  } = useMediaStream({ acquire: requestCameraStream, mapError: cameraErrorMessage, videoRef });

  const [faceDetected, setFaceDetected] = useState(false);
  const [detectorReady, setDetectorReady] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  // Counts down from CAPTURE_COUNTDOWN_SECONDS once Capture is tapped; null
  // whenever the countdown isn't running.
  const [countdown, setCountdown] = useState<number | null>(null);
  // Drives the post-capture success flourish (CaptureSuccessBurst), matching
  // Face/Eye's own justCaptured window.
  const [justCaptured, setJustCaptured] = useState(false);

  // Load MediaPipe's face detector (a real ML model, not a Haar cascade) in
  // the background — purely to drive the guidance toast's copy below, never
  // to gate capture: this screen also captures non-facial skin patches,
  // where "no face" is an expected, valid state.
  useEffect(() => {
    let cancelled = false;
    getFaceDetector()
      .then((detector) => {
        if (cancelled) return;
        detectorRef.current = detector;
        setDetectorReady(true);
      })
      .catch(() => {
        // Best-effort guide only; capture still works without it.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCapture = useCallback(() => {
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

        setJustCaptured(true);
        if (justCapturedTimeoutRef.current) clearTimeout(justCapturedTimeoutRef.current);
        justCapturedTimeoutRef.current = setTimeout(() => setJustCaptured(false), JUST_CAPTURED_DURATION_MS);
      },
      'image/jpeg',
      0.9,
    );
  }, [streamRef]);

  // Ticks the visible countdown down once a second and fires the actual
  // capture at 0 — a plain UI beat, not a gate: nothing here checks whether
  // a face (or anything else) is in frame.
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      setCountdown(null);
      handleCapture();
      return;
    }
    const id = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(id);
  }, [countdown, handleCapture]);

  const startCapture = useCallback(() => {
    setCountdown(CAPTURE_COUNTDOWN_SECONDS);
  }, []);

  // Live face-presence loop, purely to drive the guidance toast's copy — see
  // the detector-loading effect above for why this never gates capture.
  useEffect(() => {
    if (!cameraReady || !detectorReady || capturedBlob) return;

    let stopped = false;

    const step = () => {
      if (stopped) return;
      const video = videoRef.current;
      const detector = detectorRef.current;

      if (video && detector && video.videoWidth > 0) {
        const now = performance.now();
        const dueForInference =
          now - lastInferAtRef.current >= INFER_INTERVAL_MS && video.currentTime !== lastVideoTimeRef.current && now > lastTimestampRef.current;

        if (dueForInference) {
          lastVideoTimeRef.current = video.currentTime;
          lastInferAtRef.current = now;
          lastTimestampRef.current = now;

          const result = detector.detectForVideo(video, now);
          setFaceDetected(Boolean(result.detections[0]));
        }
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      stopped = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [cameraReady, detectorReady, capturedBlob]);

  const handleRetake = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setCapturedBlob(null);
    setJustCaptured(false);
    setCountdown(null);
    if (justCapturedTimeoutRef.current) clearTimeout(justCapturedTimeoutRef.current);
    restartCameraStream();
  }, [previewUrl, restartCameraStream]);

  useEffect(
    () => () => {
      if (justCapturedTimeoutRef.current) clearTimeout(justCapturedTimeoutRef.current);
    },
    [],
  );

  const systemReady = cameraReady && detectorReady;
  const guidanceToast = useGuidanceToast(
    systemReady && countdown === null && !faceDetected ? "Center what you'd like scanned inside the circle" : null,
  );
  const guideState: FaceScanState = justCaptured
    ? 'success'
    : countdown !== null || faceDetected
      ? 'scanning'
      : 'waiting';

  if (cameraError) {
    return <MediaErrorState error={cameraError} />;
  }

  if (capturedBlob && previewUrl) {
    return (
      <CameraStage
        // On mobile the X discards the shot rather than leaving the assessment —
        // "back" from a review screen means "retake".
        onExit={handleRetake}
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
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground cam-full:text-white/85">
          {!cameraReady ? 'Starting camera…' : countdown !== null ? 'Hold steady…' : 'Position yourself inside the circle'}
        </p>
      }
      controls={
        <Button disabled={!cameraReady || countdown !== null} onClick={startCapture}>
          <Camera className="size-4" /> Capture photo
        </Button>
      }
    >
      <FaceScanFrame state={guideState} />
      <FaceScanTopBar active={systemReady} />
      <GuidanceToast message={guidanceToast} />
      <CaptureCountdown value={countdown} />
      {/* Static positioning guide */}
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
        <div className="aspect-square w-[66cqmin] rounded-full border-2 border-dashed border-white/70" />
      </div>
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
