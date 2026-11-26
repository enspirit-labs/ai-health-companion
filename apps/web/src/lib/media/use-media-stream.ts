'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

interface UseMediaStreamOptions<E> {
  /** Requests the camera/mic stream, e.g. requestCameraStream or requestMicrophoneStream. */
  acquire: () => Promise<MediaStream>;
  /** Maps a getUserMedia rejection into a user-facing error value (a string, or a richer classified shape). */
  mapError: (error: unknown) => E;
  /** When provided, the acquired stream is attached to this video element's srcObject. */
  videoRef?: RefObject<HTMLVideoElement | null>;
}

/**
 * Shared camera/mic stream lifecycle: acquires on mount, stops all tracks on
 * unmount, and exposes `restart()` for re-acquiring after a capture (used by
 * capture components whose "retake" flow needs a fresh stream — not every
 * caller does; voice-capture never re-acquires the mic on retake).
 */
export function useMediaStream<E>({ acquire, mapError, videoRef }: UseMediaStreamOptions<E>) {
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<E | null>(null);

  useEffect(() => {
    let cancelled = false;

    acquire()
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef?.current) videoRef.current.srcObject = stream;
        setReady(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(mapError(err));
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // Intentionally run once on mount, mirroring the original per-component effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restart = useCallback(() => {
    // Stop the outgoing stream's tracks before swapping in the new one —
    // otherwise the old getUserMedia capture is simply dropped from JS
    // (nothing calls .stop() on it), so the camera/mic keeps running in the
    // background — the hardware indicator light stays on — for as long as
    // the page stays open, even across further retakes.
    streamRef.current?.getTracks().forEach((t) => t.stop());
    acquire()
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef?.current) videoRef.current.srcObject = stream;
      })
      .catch((err: unknown) => setError(mapError(err)));
  }, [acquire, mapError, videoRef]);

  return { streamRef, ready, error, restart };
}
