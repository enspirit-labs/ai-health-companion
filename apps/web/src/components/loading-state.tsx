import { HeartbeatIcon } from '@/components/heartbeat-icon';
import { cn } from '@/lib/utils';

export function LoadingState({
  label = 'Loading…',
  variant = 'block',
  className,
}: {
  label?: string;
  /**
   * 'inline' = spinner + text row.
   * 'block' = centered with vertical padding, for a card/section alongside other content.
   * 'page' = for a bare `<main className="flex flex-1 items-center justify-center">` with
   * nothing else on screen (no PageHeader) — the whole viewport is empty but for this, so
   * 'block' sizing reads as lost in the space. Bigger icon + text, more breathing room.
   */
  variant?: 'inline' | 'block' | 'page';
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        'flex items-center gap-2 text-sm text-muted-foreground',
        variant === 'block' && 'flex-col justify-center gap-3 py-10 text-center',
        variant === 'page' && 'flex-col justify-center gap-4 py-10 text-center text-base',
        className,
      )}
    >
      <HeartbeatIcon className={variant === 'page' ? 'size-14' : variant === 'block' ? 'size-8' : 'size-4'} />
      {label}
    </div>
  );
}
