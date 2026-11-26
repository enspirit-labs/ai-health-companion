import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

export function EmptyState({
  icon: Icon,
  message,
  action,
  iconClassName,
  className,
}: {
  icon?: LucideIcon;
  message: ReactNode;
  /** Optional single CTA, e.g. a Button linking to the action that fills this state. */
  action?: ReactNode;
  iconClassName?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn('flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground', className)}
    >
      {Icon ? <Icon aria-hidden="true" className={cn('size-8', iconClassName ?? 'text-muted-foreground/50')} /> : null}
      {message}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
