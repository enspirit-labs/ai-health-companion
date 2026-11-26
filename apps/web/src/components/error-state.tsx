import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Never pass a raw `error.message` into `description` — this is user-facing
 * copy for a health app and query errors may echo request/PII details.
 * Icon deliberately stays neutral (muted/destructive), not the status
 * palette, so a failed request is never mistaken for a health-risk signal.
 */
export function ErrorState({
  title = 'Something went wrong',
  description = 'Please try again in a moment.',
  onRetry,
  retryLabel = 'Try again',
  className,
}: {
  title?: string;
  description?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center gap-2 py-10 text-center text-sm', className)}
    >
      <AlertTriangle aria-hidden="true" className="size-8 text-muted-foreground/50" />
      <p className="font-medium text-foreground">{title}</p>
      <p className="text-muted-foreground">{description}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}
