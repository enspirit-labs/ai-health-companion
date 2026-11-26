'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { UserRound } from 'lucide-react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { HeartbeatIcon } from '@/components/heartbeat-icon';
import { cn } from '@/lib/utils';

export type ChatRole = 'user' | 'assistant';

const SPEAKER_LABEL: Record<ChatRole, string> = {
  user: 'You said',
  assistant: 'AI Health Coach said',
};

/**
 * "Ada Lovelace" -> "AL", "Ada" -> "A", anything without a usable word -> null
 * (the caller then falls back to a glyph avatar rather than an empty circle).
 */
export function initialsFromName(fullName?: string | null): string | null {
  const words = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return `${first}${last}`.toUpperCase();
}

/**
 * The speaker mark beside a bubble. Decorative (`aria-hidden`) on purpose — who
 * is speaking is carried by the visually-hidden text label ChatBubble renders,
 * so identity never depends on colour or iconography alone.
 *
 * The assistant reuses the app's existing HeartbeatIcon brand mark (the same one
 * LoadingState uses) instead of introducing a second piece of AI iconography.
 */
export function ChatAvatar({
  role,
  initials,
  className,
}: {
  role: ChatRole;
  /** Rendered for `role="user"`; falls back to a person glyph when null/absent. */
  initials?: string | null;
  className?: string;
}) {
  return (
    <Avatar aria-hidden="true" className={cn('mb-0.5 size-8', className)}>
      <AvatarFallback
        className={cn(
          role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground',
        )}
      >
        {role === 'user' ? (
          (initials ?? <UserRound className="size-4" />)
        ) : (
          <HeartbeatIcon className="size-4" />
        )}
      </AvatarFallback>
    </Avatar>
  );
}

/**
 * One chat-style message bubble — currently used only by the AI Health Coach
 * chat page (the Q&A-style assessment/onboarding screens render their own
 * markup and do not import this). Each bubble animates in independently — for a
 * question+answer pair rendered in the same tick this looks the same as a
 * single shared fade-in would.
 *
 * The row is avatar + bubble; `className` styles the *bubble*, not the row, so
 * callers can tint message text without disturbing the layout.
 */
export function ChatBubble({
  role,
  children,
  initials,
  className,
}: {
  role: ChatRole;
  children: ReactNode;
  /** User avatar initials, e.g. from `initialsFromName(user.fullName)`. */
  initials?: string | null;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('flex w-full items-end gap-2', role === 'user' && 'justify-end')}
    >
      <span className="sr-only">{SPEAKER_LABEL[role]}</span>
      <ChatAvatar role={role} initials={initials} className={role === 'user' ? 'order-last' : 'order-first'} />
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap',
          role === 'user'
            ? 'rounded-br-sm bg-primary text-primary-foreground'
            : // bg-card (not bg-muted) is what separates an assistant turn from the
              // page's own --background; border + shadow-sm match the Card surface.
              'rounded-bl-sm border border-border bg-card text-card-foreground shadow-sm',
          className,
        )}
      >
        {children}
      </div>
    </motion.div>
  );
}
