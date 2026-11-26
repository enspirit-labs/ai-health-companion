'use client';

import { useEffect } from 'react';

/**
 * Freezes background page scroll while `enabled` is true.
 *
 * Needed by the full-screen mobile camera: the stage is `position: fixed`, so
 * without this the page underneath still scrolls under the user's fingers while
 * they're framing a shot, and the scroll position is lost by the time they come
 * back out.
 *
 * Restores the *previous* inline value rather than blindly clearing it, so
 * nesting (or another lock owner) can't leave the page permanently unscrollable.
 */
export function useBodyScrollLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousOverscroll = body.style.overscrollBehavior;

    body.style.overflow = 'hidden';
    // Stops the pull-to-refresh / rubber-band gesture from firing on the page
    // behind the overlay on iOS and Android.
    body.style.overscrollBehavior = 'none';

    return () => {
      body.style.overflow = previousOverflow;
      body.style.overscrollBehavior = previousOverscroll;
    };
  }, [enabled]);
}
