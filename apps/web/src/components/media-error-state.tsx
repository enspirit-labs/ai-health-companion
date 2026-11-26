import { ShieldAlert, VideoOff } from 'lucide-react';
import type { MediaAccessError } from '@/lib/media/user-media';
import { cn } from '@/lib/utils';

const ICONS: Record<MediaAccessError['kind'], typeof ShieldAlert> = {
  denied: ShieldAlert,
  unavailable: VideoOff,
  insecure: ShieldAlert,
};

/**
 * Renders a camera/mic access failure honestly, distinguishing a declined
 * permission from a missing device or an insecure context rather than one
 * generic message — see `classifyMediaError` in lib/media/user-media.ts.
 */
export function MediaErrorState({ error, className }: { error: MediaAccessError; className?: string }) {
  const Icon = ICONS[error.kind];
  return (
    <div role="alert" className={cn('flex flex-col items-center gap-2 py-6 text-center text-sm', className)}>
      <Icon aria-hidden="true" className="size-8 text-muted-foreground/50" />
      <p className="text-muted-foreground">{error.message}</p>
    </div>
  );
}
