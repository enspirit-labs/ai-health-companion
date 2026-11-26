'use client';

import { useEffect, useState } from 'react';

/**
 * The exact complement of the `cam-inline` variant in globals.css, and identical
 * to `cam-full` — keep all three in step.
 *
 * Two axes, not just width: a landscape phone is ~812x375, wide enough to clear
 * a width-only 768px check but far too short to hold a contained camera frame
 * plus its controls. Height has to count.
 */
const COMPACT_QUERY = '(max-width: 767.9375px), (max-height: 599.9375px)';

/**
 * True when the viewport is in "compact" (phone/small-tablet) mode.
 *
 * Layout itself is driven by CSS, never by this hook — reach for it only when a
 * behaviour genuinely cannot be expressed in CSS (e.g. locking body scroll while
 * an immersive overlay is up). Returns `false` on the server and on the first
 * client render to keep hydration stable; the effect corrects it immediately,
 * and a one-frame `false` is harmless for the behaviours it gates.
 */
export function useCompactViewport(): boolean {
  const [isCompact, setIsCompact] = useState(false);

  useEffect(() => {
    const query = window.matchMedia(COMPACT_QUERY);
    setIsCompact(query.matches);

    const onChange = (event: MediaQueryListEvent) => setIsCompact(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return isCompact;
}
