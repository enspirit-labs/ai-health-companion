'use client';

import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

import { cn } from '@/lib/utils';

const TONES = {
  error: {
    icon: AlertCircle,
    // Bordered + iconned rather than colour-only, so the message survives a
    // colour-vision difference or a greyscale screenshot.
    className: 'border-status-critical/60 bg-status-critical/5 text-foreground',
    iconClassName: 'text-status-critical',
    prefix: 'Oops!',
  },
  warning: {
    icon: Info,
    className: 'border-status-warning/60 bg-status-warning/5 text-foreground',
    iconClassName: 'text-status-warning',
    prefix: null,
  },
  success: {
    icon: CheckCircle2,
    className: 'border-status-good/60 bg-status-good/5 text-foreground',
    iconClassName: 'text-status-good',
    prefix: null,
  },
} as const;

/**
 * The live validation banner. `role="status"` (not `alert`) deliberately: a
 * rule breach while solving is ongoing feedback, and an assertive live region
 * would interrupt a screen-reader user on every single tap.
 */
export function GameFeedback({
  tone,
  message,
}: {
  tone: keyof typeof TONES;
  message: string;
}) {
  const { icon: Icon, className, iconClassName, prefix } = TONES[tone];

  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm animate-in fade-in slide-in-from-bottom-1 duration-200',
        className,
      )}
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', iconClassName)} aria-hidden="true" />
      <p>
        {prefix ? <span className="font-semibold">{prefix} </span> : null}
        {message}
      </p>
    </div>
  );
}
