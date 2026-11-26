import { cn } from '@/lib/utils';

/**
 * Slim top status pill — a live/active pulsing dot plus a decorative traced
 * waveform, echoing the reference's heart-rate readout without fabricating
 * one: this screen doesn't measure any vitals, so nothing here is a number
 * standing in for real biometric data, just a motif for "the model is
 * actively reading this frame." Reuses the same `.ecg-trace` dash-draw
 * animation already established for the landing page's heart icon.
 *
 * Sits top-center, clear of CameraStage's own top-left exit button.
 *
 * `label` names which face region the scan highlight (face-scan-highlights.tsx)
 * is currently pointing at, e.g. "Under-Eye Area" — a region name, never a
 * finding/verdict (see that component's own doc comment for why).
 */
export function FaceScanTopBar({ active, label }: { active: boolean; label?: string }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="flex items-center gap-2 rounded-full bg-black/30 px-3 py-1.5 backdrop-blur-sm">
        <span className={cn('size-1.5 rounded-full bg-amber-200 transition-opacity duration-500', active ? 'animate-pulse opacity-100' : 'opacity-40')} />
        <svg viewBox="0 0 60 20" className="h-3 w-10 text-amber-200/80" fill="none" aria-hidden="true">
          <path
            d="M0 10 H14 L18 3 L24 17 L28 10 H60"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={100}
            className={active ? 'ecg-trace' : undefined}
          />
        </svg>
        {label ? <span className="text-xs font-medium text-amber-100/90">{label}</span> : null}
      </div>
    </div>
  );
}
