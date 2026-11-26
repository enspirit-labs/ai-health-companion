'use client';

import { CheckCircle2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Shown when a step (photo/recording captured, all questions answered, a
 * sub-flow finished) leaves the user ready to continue — same card chrome as
 * ConsentGate/HealthProfileIntroCard so this reads as a milestone rather than
 * an ad-hoc colored banner. Omit `actionLabel`/`onAction` for a message-only
 * card that the page auto-advances away from (e.g. health-profile's "All set").
 */
export function CompletionCard({
  title,
  actionLabel,
  onAction,
  isActionPending,
  isActionDisabled,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  isActionPending?: boolean;
  isActionDisabled?: boolean;
}) {
  return (
    <Card role="status" className="stripe-top w-full max-w-lg overflow-hidden">
      <CardContent className="flex flex-col items-center gap-6 px-6 py-8 text-center sm:px-10">
        <div className="flex size-14 items-center justify-center rounded-full bg-status-good/15">
          <CheckCircle2 aria-hidden="true" className="size-7 text-status-good" />
        </div>
        <p className="text-xl font-medium">{title}</p>
        {onAction ? (
          <Button size="lg" disabled={isActionDisabled || isActionPending} onClick={onAction}>
            {isActionPending ? 'Analyzing…' : actionLabel}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
