'use client';

import { useEffect, useRef, useState } from 'react';

// Once a message is shown, it stays up at least this long before a
// different message is allowed to replace it — `rejectMessage` is derived
// fresh every inference tick (~130ms, see INFER_INTERVAL_MS) and isn't
// smoothed the way the checklist's `confirmed` state is, so near a
// threshold boundary it can genuinely flip tick-to-tick. Without this a
// borderline frame would flicker the toast rather than read as one steady
// instruction.
const MIN_DISPLAY_MS = 900;
// Grace period before actually clearing the toast once the underlying
// message goes null — absorbs a single missed-detection frame so the toast
// doesn't blip away and immediately back.
const CLEAR_GRACE_MS = 300;

export interface GuidanceToastMessage {
  text: string;
  /** Bumped on every real (non-debounced) message change — remounting the
   * toast on this key is what re-triggers its slide-up/fade-in animation. */
  key: number;
}

/** Turns a raw, possibly-flickery guidance string into a debounced value
 * suitable for display — see MIN_DISPLAY_MS/CLEAR_GRACE_MS above. */
export function useGuidanceToast(message: string | null): GuidanceToastMessage | null {
  const [display, setDisplay] = useState<GuidanceToastMessage | null>(null);
  const lastChangeAtRef = useRef(0);
  const keyRef = useRef(0);
  const clearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (clearTimeoutRef.current) {
      clearTimeout(clearTimeoutRef.current);
      clearTimeoutRef.current = null;
    }

    if (message === null) {
      clearTimeoutRef.current = setTimeout(() => setDisplay(null), CLEAR_GRACE_MS);
      return;
    }

    setDisplay((current) => {
      if (current?.text === message) return current;
      const now = performance.now();
      if (current && now - lastChangeAtRef.current < MIN_DISPLAY_MS) {
        // Too soon to swap — next tick (if this message is still current or
        // changes again) will retry.
        return current;
      }
      lastChangeAtRef.current = now;
      keyRef.current += 1;
      return { text: message, key: keyRef.current };
    });
  }, [message]);

  useEffect(
    () => () => {
      if (clearTimeoutRef.current) clearTimeout(clearTimeoutRef.current);
    },
    [],
  );

  return display;
}

/** Floating guidance pill near the top of the feed — never over the face
 * guide itself, so it never blocks the camera. Remounts (via `key`) whenever
 * the debounced message changes, replaying the slide-up/fade-in animation. */
export function GuidanceToast({ message }: { message: GuidanceToastMessage | null }) {
  if (!message) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[10%] z-30 flex justify-center px-6">
      <div
        key={message.key}
        className="face-scan-toast-enter max-w-[85%] rounded-full border border-white/15 bg-black/55 px-4 py-2 text-center text-sm font-medium text-white backdrop-blur-sm"
      >
        {message.text}
      </div>
    </div>
  );
}
