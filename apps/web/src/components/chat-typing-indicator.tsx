'use client';

import { motion, useReducedMotion } from 'framer-motion';

import { ChatAvatar } from '@/components/chat-bubble';
import { cn } from '@/lib/utils';

const DOTS = [0, 1, 2];

/**
 * The "AI is composing a reply" state, shaped like an assistant ChatBubble so it
 * reads as the next turn arriving rather than as a separate loading widget.
 *
 * Three dots pulse on a stagger; with `prefers-reduced-motion: reduce` they hold
 * still instead (same contract as the CSS-level animation guards in globals.css).
 * Screen readers get one polite announcement from the visually-hidden label.
 */
export function ChatTypingIndicator({ className }: { className?: string }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div role="status" aria-live="polite" className={cn('flex w-full items-end gap-2', className)}>
      <span className="sr-only">AI Health Coach is typing</span>
      <ChatAvatar role="assistant" />
      <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-3 shadow-sm">
        {DOTS.map((index) =>
          shouldReduceMotion ? (
            <span
              key={index}
              data-slot="chat-typing-dot"
              data-motion="static"
              aria-hidden="true"
              className="size-1.5 rounded-full bg-muted-foreground/70"
            />
          ) : (
            <motion.span
              key={index}
              data-slot="chat-typing-dot"
              data-motion="pulse"
              aria-hidden="true"
              className="size-1.5 rounded-full bg-muted-foreground/70"
              animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
              transition={{ duration: 1.2, ease: 'easeInOut', repeat: Infinity, delay: index * 0.18 }}
            />
          ),
        )}
      </div>
    </div>
  );
}
