'use client';

import { Lightbulb } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * Shows the *reasoning* first and only offers to place the move as a secondary
 * action — the point is that the player learns the tactic and can spot it
 * unaided next time, rather than tapping Hint as a solve button.
 */
export function HintPanel({
  reason,
  onApply,
  onDismiss,
  applyLabel = 'Place it for me',
}: {
  reason: string;
  /** Omit for games where a hint has nothing to place (e.g. a clue reveal). */
  onApply?: () => void;
  onDismiss: () => void;
  applyLabel?: string;
}) {
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-xl border border-primary/40 bg-primary/5 px-3.5 py-3 text-sm animate-in fade-in slide-in-from-bottom-1 duration-200"
    >
      <div className="flex items-start gap-2.5">
        <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <p>{reason}</p>
      </div>
      <div className="flex items-center gap-2 self-end">
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          {onApply ? "I'll do it" : 'Got it'}
        </Button>
        {onApply ? (
          <Button variant="outline" size="sm" onClick={onApply}>
            {applyLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
