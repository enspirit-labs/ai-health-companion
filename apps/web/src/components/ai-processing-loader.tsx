'use client';

import { useEffect, useState } from 'react';

import { HeartbeatIcon } from '@/components/heartbeat-icon';
import { cn } from '@/lib/utils';

const LOADING_MESSAGES = [
  'Reviewing what you captured…',
  'Running AI health reasoning…',
  'Weighing your risk factors…',
  'Cross-checking against wellness norms…',
  'Drafting your recommendations…',
  'Almost ready…',
];

const MESSAGE_INTERVAL_MS = 2200;

/**
 * Takes over the screen while the AI scores a just-completed assessment —
 * previously the page just sat static with a disabled button relabeled
 * "Analyzing…", which read as stuck rather than working. The heart/ECG icon
 * mirrors the landing page's mark (same static heart, same animated trace)
 * but without the sonar pulse-rings, and the caption rotates through
 * messages instead of sitting on one static line, so it reads as live
 * progress rather than a frozen screen.
 */
export function AiProcessingLoader({ className }: { className?: string }) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setMessageIndex((i) => (i + 1) % LOADING_MESSAGES.length);
    }, MESSAGE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center', className)}
    >
      <HeartbeatIcon className="size-20 drop-shadow-lg" />
      <p key={messageIndex} className="animate-in fade-in text-sm text-muted-foreground duration-500">
        {LOADING_MESSAGES[messageIndex]}
      </p>
      <span className="sr-only">Fetching your health results from AI. This can take a few seconds.</span>
    </div>
  );
}
