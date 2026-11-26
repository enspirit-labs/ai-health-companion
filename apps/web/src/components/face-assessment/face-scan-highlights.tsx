export interface ScanPoint {
  x: number;
  y: number;
}

export interface ScanAnchors {
  underEyeLeft: ScanPoint | null;
  underEyeRight: ScanPoint | null;
  cheekLeft: ScanPoint | null;
  cheekRight: ScanPoint | null;
  forehead: ScanPoint | null;
  noseTip: ScanPoint | null;
}

export interface ScanCategory {
  key: string;
  label: string;
  anchorKeys: (keyof ScanAnchors)[];
}

/** What the scanning visual cycles through — region *names* only, never a
 * specific finding. There is no real skin-condition model behind this
 * (MediaPipe's face mesh gives geometry, not skin analysis) — asserting a
 * verdict like "redness detected" here would be fabricated output on a
 * health app, so this only ever shows "here's what the AI is looking at
 * right now", the same honesty bar as the rest of this screen (see
 * face-scan-topbar.tsx's note on not faking a heart-rate number). */
export const SCAN_CATEGORIES: ScanCategory[] = [
  { key: 'underEye', label: 'Under-Eye Area', anchorKeys: ['underEyeLeft', 'underEyeRight'] },
  { key: 'skinTone', label: 'Skin Tone', anchorKeys: ['cheekLeft', 'cheekRight'] },
  { key: 'texture', label: 'Skin Texture', anchorKeys: ['forehead'] },
  { key: 'tZone', label: 'T-Zone', anchorKeys: ['noseTip'] },
];

export const SCAN_CATEGORY_INTERVAL_MS = 1800;

/**
 * Replaces the low-poly wireframe with a subtler "here's what the AI is
 * looking at" visual: a small pulsing marker at each anchor point belonging
 * to the currently active `ScanCategory`, positioned from real landmark
 * coordinates. No labels drawn here — the active category's name is shown
 * in the top bar instead (see face-scan-topbar.tsx), so this stays purely a
 * spatial highlight.
 */
export function FaceScanHighlights({ anchors, category }: { anchors: ScanAnchors | null; category: ScanCategory | undefined }) {
  if (!category) return null;
  if (!anchors) return null;

  const points = category.anchorKeys.map((key) => anchors[key]).filter((point): point is ScanPoint => Boolean(point));
  if (points.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      {points.map((point, index) => (
        // The video is CSS-mirrored (scaleX(-1)); landmark coordinates are
        // in the raw, unmirrored frame, so flip x to match what's shown.
        <div
          key={`${category.key}-${index}`}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${(1 - point.x) * 100}%`, top: `${point.y * 100}%` }}
        >
          <span className="absolute -inset-2 rounded-full border border-amber-200/50 [animation:pulseRing_1.6s_ease-out_infinite]" />
          <span className="relative block size-2 rounded-full bg-amber-200 shadow-[0_0_8px_2px_rgba(246,217,174,0.75)]" />
        </div>
      ))}
    </div>
  );
}
