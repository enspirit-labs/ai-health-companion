'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useBodyScrollLock } from '@/lib/use-body-scroll-lock';
import { useCompactViewport } from '@/lib/use-compact-viewport';

/**
 * Fit classes for the live `<video>`. Every capture surface must use this so the
 * feed fills its box identically everywhere.
 *
 * `object-cover` is the fix for the "camera shows up as a short frame" bug: a
 * bare `w-full` video letterboxes to the stream's own 4:3 landscape ratio, which
 * on a portrait phone renders a ~375x281 strip (and flashes the 300x150 HTML
 * default before metadata resolves).
 */
export const CAMERA_FEED_CLASS = 'absolute inset-0 size-full object-cover';

/**
 * Fit classes for an ML overlay `<canvas>` drawn on top of the feed. Uses the
 * SAME box and the SAME `object-cover` fit as the video on purpose — that is
 * what keeps detection boxes and pose skeletons registered with what the user
 * sees. Callers still add their own `scale-x-[-1]` to match a mirrored feed.
 */
export const CAMERA_OVERLAY_CLASS = 'pointer-events-none absolute inset-0 z-20 size-full object-cover';

export interface CameraStageProps {
  /** The `<video>` and any overlay `<canvas>`, using the fit constants above. */
  children: ReactNode;
  /** Short instruction, e.g. "Look left". Overlaid on mobile, above the frame at md+. */
  prompt?: ReactNode;
  /** Full-bleed warning strip pinned to the top of the feed (lighting, posture fault). */
  banner?: ReactNode;
  /** Coaching/status line, sits directly above the controls. */
  status?: ReactNode;
  /** Capture / retake / submit buttons. */
  controls?: ReactNode;
  /**
   * Secondary guidance surface (currently only the squats rep counter). Overlaid
   * on the feed below md, a real side-by-side panel at lg+.
   */
  panel?: ReactNode;
  /** Mobile-only escape hatch. Defaults to `router.back()`. */
  onExit?: () => void;
  /** Frame treatment, e.g. `border-4 border-destructive` or `ring-4 ring-status-warning`. */
  className?: string;
  /** Aspect box at md+ only; below md the stage always fills the viewport. */
  ratio?: '4/3' | '3/4';
}

/**
 * Shared shell for every camera capture surface.
 *
 * Below `md` it is an immersive full-viewport layer (`fixed inset-0`, above both
 * the sticky header and the mobile tab bar) with the controls floated over the
 * feed. At `md` and up it reverts to `static` and reproduces the previous inline
 * look: a bordered, rounded, `max-w-lg` frame with the status line and buttons
 * below it. One DOM tree, responsive positioning — no duplicated markup and no
 * JS deciding the layout.
 *
 * Capture fidelity note: `object-cover` crops what is *displayed*, but callers
 * capture from `video.videoWidth/videoHeight`, so the uploaded blob is still the
 * full uncropped frame. Analysis is unaffected; the user just gets a tighter
 * viewfinder instead of a letterboxed strip.
 */
export function CameraStage({
  children,
  prompt,
  banner,
  status,
  controls,
  panel,
  onExit,
  className,
  ratio = '4/3',
}: CameraStageProps) {
  const router = useRouter();
  const isCompact = useCompactViewport();

  // Only lock scrolling while the stage is actually the full-screen overlay.
  useBodyScrollLock(isCompact);

  const handleExit = onExit ?? (() => router.back());

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex flex-col bg-black',
        // `relative` rather than `static`: below lg the `panel` slot is still
        // absolutely positioned, and it needs this element as its containing
        // block or it escapes into the page. With no offsets set, `relative`
        // lays out identically to `static`.
        'cam-inline:relative cam-inline:z-auto cam-inline:w-full cam-inline:items-center cam-inline:gap-3 cam-inline:bg-transparent',
        // Was `lg:` (width-only) — panel must switch layout in lockstep with
        // the root/feed-box's own `cam-inline`/`cam-full` (width AND height)
        // breakpoint, or a wide-but-short viewport gets the root staying
        // immersive/black while the panel goes "desktop inline", muddying its
        // themed background against the still-black root behind it.
        panel && 'cam-inline:flex-row cam-inline:items-stretch cam-inline:gap-3',
      )}
    >
      {prompt ? (
        <p
          className={cn(
            // Centred but inset past the exit button so the two never collide.
            'absolute inset-x-0 top-0 z-30 px-14 text-center text-sm font-medium text-white',
            'cam-full:pt-[max(0.75rem,env(safe-area-inset-top))]',
            'cam-inline:static cam-inline:z-auto cam-inline:px-0 cam-inline:text-foreground',
          )}
        >
          {prompt}
        </p>
      ) : null}

      {/* Feed box */}
      <div
        className={cn(
          // Makes the feed a query container on BOTH axes so positioning guides
          // can size themselves off its smaller dimension with `cqmin` — the only
          // way to keep a circular guide circular in portrait AND landscape
          // (`aspect-square` plus `max-h-*`/`max-w-*` can't: the cap wins on one
          // axis and the "circle" renders as an oval).
          // `container-type: size`, not Tailwind's `@container` (inline-size):
          // inline-size leaves the block axis uncontained, so `cqmin` silently
          // falls back to the viewport height and stops tracking this box.
          // Safe here because the feed's size comes from flex/aspect-ratio, never
          // from its contents — every child is absolutely positioned.
          'relative min-h-0 w-full flex-1 overflow-hidden [container-type:size]',
          'cam-inline:max-w-lg cam-inline:flex-none cam-inline:rounded-xl cam-inline:border',
          ratio === '4/3' ? 'cam-inline:aspect-[4/3]' : 'cam-inline:aspect-[3/4]',
          panel && 'cam-inline:max-w-none cam-inline:flex-1 cam-inline:aspect-auto cam-inline:min-h-[70vh]',
          className,
        )}
      >
        {children}

        {banner ? <div className="absolute inset-x-0 top-0 z-30">{banner}</div> : null}

        {/* Mobile-only exit: the app header is covered by this overlay, so
            without it there is no way out of a capture screen on a phone. */}
        <button
          type="button"
          onClick={handleExit}
          aria-label="Close camera"
          className={cn(
            'absolute left-3 z-40 flex size-11 cursor-pointer items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-colors hover:bg-black/70 cam-inline:hidden',
            'top-[max(0.75rem,env(safe-area-inset-top))]',
          )}
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>

      {panel ? (
        <div
          className={cn(
            'absolute inset-x-0 bottom-0 z-20 flex flex-col items-center justify-center gap-3 px-4 text-center text-white',
            // Clear the controls scrim when there is one; otherwise just the
            // device safe area.
            status || controls ? 'pb-32' : 'cam-full:pb-[max(1rem,env(safe-area-inset-bottom))]',
            'cam-inline:static cam-inline:z-auto cam-inline:flex-1 cam-inline:gap-6 cam-inline:rounded-xl cam-inline:bg-muted/40 cam-inline:p-6 cam-inline:pb-6 cam-inline:text-foreground',
          )}
        >
          {panel}
        </div>
      ) : null}

      {/* Controls: floated over the feed while immersive, behind a scrim so white
          text stays legible against an arbitrary camera image; a plain block
          below the frame once inline, matching the original desktop composition. */}
      {status || controls ? (
        <div
          className={cn(
            'absolute inset-x-0 bottom-0 z-30 flex flex-col items-center gap-2 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-4 pt-10 text-white',
            'cam-full:pb-[max(1rem,env(safe-area-inset-bottom))]',
            'cam-inline:static cam-inline:z-auto cam-inline:gap-3 cam-inline:bg-none cam-inline:px-0 cam-inline:pt-0 cam-inline:text-foreground',
          )}
        >
          {status}
          {controls}
        </div>
      ) : null}
    </div>
  );
}
