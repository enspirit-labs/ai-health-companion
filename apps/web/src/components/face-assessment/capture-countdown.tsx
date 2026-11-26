import type { CSSProperties } from 'react';

/** "Capturing in 3 2 1" overlay shown once every validation has passed and
 * held steady — each number remounts (via `key={value}`) to replay its
 * scale-in animation. Renders nothing once the countdown isn't running. */
export function CaptureCountdown({ value }: { value: number | null }) {
  if (value === null) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-1">
      <p className="text-sm font-medium tracking-wide text-white/80">Capturing in</p>
      <span key={value} className="face-scan-countdown-tick text-7xl font-bold text-amber-100 drop-shadow-[0_0_20px_rgba(232,176,116,0.85)]">
        {value}
      </span>
    </div>
  );
}

const BURST_ANGLES = Array.from({ length: 10 }, (_, i) => (360 / 10) * i);

/** Post-capture success flourish: a warm amber particle burst radiating from
 * center plus a self-drawing checkmark. Mount this only for the brief window
 * right after `handleCapture` fires (see `justCaptured` in
 * face-mesh-capture.tsx) — it's a one-shot animation, not a steady state. */
export function CaptureSuccessBurst() {
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
      {BURST_ANGLES.map((angle) => (
        <span
          key={angle}
          className="face-scan-burst absolute top-1/2 left-1/2 size-1.5 rounded-full bg-amber-200 shadow-[0_0_8px_2px_rgba(246,217,174,0.8)]"
          style={{ '--burst-angle': `${angle}deg` } as CSSProperties}
        />
      ))}
      <svg viewBox="0 0 24 24" className="size-20" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke="rgba(232,176,116,0.4)" strokeWidth="1.5" />
        <path
          d="M7 12.5l3.2 3.2L17 9"
          stroke="#F6D9AE"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="face-scan-checkmark-path"
          pathLength={40}
        />
      </svg>
    </div>
  );
}
