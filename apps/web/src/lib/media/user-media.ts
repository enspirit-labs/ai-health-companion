'use client';

const MEDIA_UNAVAILABLE_MESSAGE =
  'This requires a secure connection (HTTPS or localhost) and browser permission.';

const DEFAULT_CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: 'user', width: 640, height: 480 },
  audio: false,
};

/** Wraps `getUserMedia` with a guard for browsers/contexts where
 * `navigator.mediaDevices` doesn't exist at all (most commonly: the page was
 * loaded over plain HTTP from something other than localhost). Without this,
 * `navigator.mediaDevices.getUserMedia(...)` throws synchronously — before
 * the promise chain even starts — which bypasses a caller's `.catch()` and
 * crashes the component instead of surfacing a friendly camera/mic error. */
function requestUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return Promise.reject(new Error(MEDIA_UNAVAILABLE_MESSAGE));
  }
  return navigator.mediaDevices.getUserMedia(constraints);
}

export function requestCameraStream(constraints: MediaStreamConstraints = DEFAULT_CAMERA_CONSTRAINTS): Promise<MediaStream> {
  return requestUserMedia(constraints);
}

export function requestMicrophoneStream(constraints: MediaStreamConstraints = { audio: true }): Promise<MediaStream> {
  return requestUserMedia(constraints);
}

/**
 * Distinguishes *why* getUserMedia failed so the UI can render an honest,
 * specific message instead of one generic "check your permissions" string —
 * a declined permission, a missing device, and an insecure context each need
 * different (and differently actionable) copy.
 */
export type MediaErrorKind = 'denied' | 'unavailable' | 'insecure';

export interface MediaAccessError {
  kind: MediaErrorKind;
  message: string;
}

/** Turns a `requestCameraStream`/`requestMicrophoneStream` rejection into UI
 * copy, classified by cause: the "needs HTTPS/localhost" case, a declined
 * permission (`NotAllowedError`), a missing device (`NotFoundError`), or an
 * unknown failure (treated as `unavailable`). */
function classifyMediaError(error: unknown, deviceLabel: 'camera' | 'microphone'): MediaAccessError {
  if (error instanceof Error && error.message === MEDIA_UNAVAILABLE_MESSAGE) {
    return { kind: 'insecure', message: `Could not access your ${deviceLabel}. ${MEDIA_UNAVAILABLE_MESSAGE}` };
  }
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      return {
        kind: 'denied',
        message: `${deviceLabel === 'camera' ? 'Camera' : 'Microphone'} access was denied. Enable it in your browser's site settings to continue.`,
      };
    }
    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      return { kind: 'unavailable', message: `No ${deviceLabel} was found on this device.` };
    }
  }
  return { kind: 'unavailable', message: `Could not access your ${deviceLabel}. Check your browser permissions.` };
}

export function cameraErrorMessage(error: unknown): MediaAccessError {
  return classifyMediaError(error, 'camera');
}

export function microphoneErrorMessage(error: unknown): MediaAccessError {
  return classifyMediaError(error, 'microphone');
}
