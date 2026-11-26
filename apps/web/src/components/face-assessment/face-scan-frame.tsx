import { CheckCircle2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { FACE_SCAN_GLOW, type FaceScanState } from '@/lib/cv/face-scan-theme';

/**
 * The Face Assessment's premium scan chrome: a soft, blurred ambient glow
 * halo behind the head — no hard-edged guide box, no dashed circle. Modeled
 * on dribbble.com/shots/24134335-Face-Scan, which conveys "AI is reading
 * your face" purely through light rather than a geometric frame the user
 * has to align to; the guidance toast (separately rendered) still tells the
 * user what to fix, so the halo doesn't need to double as a hard boundary.
 *
 * One warm accent family for every state (see face-scan-theme.ts) — `error`
 * only shifts the glow slightly warmer/redder and adds a brief shake, it
 * never jumps to a distinct hue.
 *
 * Positioned to fill its container (a `[container-type:size]` box, see
 * CameraStage) so `cqmin` sizing keeps the halo circular in both portrait
 * and landscape.
 */
export function FaceScanFrame({ state }: { state: FaceScanState }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div
        className={cn('face-scan-glow-pulse aspect-square w-[72cqmin] rounded-full blur-3xl transition-[background] duration-700 ease-out', {
          'face-scan-shake': state === 'error',
        })}
        style={{ background: `radial-gradient(circle, ${FACE_SCAN_GLOW[state]} 0%, transparent 72%)` }}
      />

      {state === 'success' ? (
        <div className="absolute flex aspect-square w-[36cqmin] items-center justify-center">
          <div className="absolute inset-0 rounded-full border border-amber-100/50 [animation:pulseRing_1s_ease-out_1]" />
          <CheckCircle2 className="size-14 text-amber-100 drop-shadow-[0_0_18px_rgba(246,217,174,0.85)]" strokeWidth={2} aria-hidden="true" />
        </div>
      ) : null}
    </div>
  );
}
