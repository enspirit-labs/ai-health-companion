import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { ChipState } from '@/lib/cv/face-scan-theme';

export interface AiStatusItem {
  key: string;
  label: string;
  icon: LucideIcon;
  state: ChipState;
}

interface Props {
  items: AiStatusItem[];
  headline: string;
  subtext: string;
  complete: boolean;
}

// A dark base fill (not just a colour/opacity change) on every state so a
// badge reads the same whether it lands over the live video feed or, at the
// cam-inline desktop breakpoint, on the app's normal light page background
// — see CameraStage's responsive collapse.
const ICON_STYLES: Record<ChipState, string> = {
  waiting: 'bg-slate-950/40 text-white/35 border-white/10',
  checking: 'bg-slate-950/40 text-amber-200/70 border-amber-200/25',
  passed: 'bg-slate-950/40 text-amber-100 border-amber-100/70 shadow-[0_0_14px_2px_rgba(246,217,174,0.55)]',
  failed: 'bg-slate-950/40 text-amber-200/35 border-amber-100/10',
};

/**
 * Bottom-center status readout for the Face Assessment's premium scan UI —
 * headline + subtext floating directly over the feed (no card chrome),
 * followed by a row of small circular icon badges, one per check. Modeled
 * on dribbble.com/shots/24134335-Face-Scan's bottom vitals row.
 *
 * Pass/fail is conveyed by icon brightness/glow, never by switching hue —
 * "what's actually wrong" is the floating guidance toast's job, so a failed
 * badge just reads as quieter than a passed one rather than alarming red.
 */
export function AiStatusPanel({ items, headline, subtext, complete }: Props) {
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-3xl bg-black/20 px-5 py-3 text-center backdrop-blur-sm">
      <div>
        <p className={cn('text-base font-medium transition-colors duration-300', complete ? 'text-amber-100' : 'text-white')}>{headline}</p>
        <p className="mt-0.5 text-xs text-white/70">{subtext}</p>
      </div>

      <div className="flex items-center gap-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.key} className="flex flex-col items-center gap-1">
              <span
                className={cn(
                  'flex size-10 items-center justify-center rounded-full border backdrop-blur-sm transition-all duration-300',
                  ICON_STYLES[item.state],
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="text-[10px] font-medium tracking-wide text-white/50 uppercase">{item.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
