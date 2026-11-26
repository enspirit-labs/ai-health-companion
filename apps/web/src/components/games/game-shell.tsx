'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, Clock } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/page-header';
import { cn } from '@/lib/utils';

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Ticks once a second while `running`. Stops dead on solve so the final time is stable. */
export function useGameTimer(running: boolean): number {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!running) return;
    const startedAt = Date.now() - elapsedMs;
    const id = setInterval(() => setElapsedMs(Date.now() - startedAt), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  return elapsedMs;
}

interface GameShellProps {
  title: string;
  tagline: string;
  difficulty: 'EASY' | 'STANDARD';
  elapsedMs: number;
  timerRunning: boolean;
  /** Rule list for the collapsible how-to-play panel. */
  rules: ReactNode[];
  /** The board / puzzle body. */
  children: ReactNode;
  /** Undo / Hint / Reset row, rendered directly under the body. */
  actions?: ReactNode;
  /** Live validation or feedback banner, below the actions (LinkedIn puts it here too). */
  feedback?: ReactNode;
}

/**
 * One chrome for every pulse game — header, timer, difficulty, how-to-play,
 * body/actions/feedback slots — so Tango and Pinpoint feel like the same
 * product rather than two separately-built screens. Adding a third game means
 * filling these slots, not rebuilding a page.
 */
export function GameShell({
  title,
  tagline,
  difficulty,
  elapsedMs,
  timerRunning,
  rules,
  children,
  actions,
  feedback,
}: GameShellProps) {
  // Open by default: the rules are reference material a first-time player
  // wants alongside the board, not a footnote they have to go looking for.
  const [rulesOpen, setRulesOpen] = useState(true);

  return (
    <main id="main-content" className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-lg px-4 pb-16 pt-6 sm:pt-10 lg:max-w-4xl">
        <PageHeader title={title} backHref="/dashboard" description={tagline} />

        <div className="mt-4 flex items-center justify-center gap-2 lg:justify-start">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm font-medium tabular-nums',
              !timerRunning && 'text-muted-foreground',
            )}
            // Announcing every tick would spam a screen reader; the final time
            // is surfaced in the completion card instead.
            aria-hidden="true"
          >
            <Clock className="size-3.5" />
            {formatDuration(elapsedMs)}
          </span>
          <Badge variant="secondary">{difficulty === 'EASY' ? 'Gentle' : 'Standard'}</Badge>
        </div>

        {/* Single column on mobile (board, then rules, stacked); from lg up,
            the rules panel sits beside the board instead of trailing below it. */}
        <div className="mt-6 flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-center">
          {/* Explicit width, not just content-based sizing: as a flex-row item
              this column would otherwise shrink-wrap to whatever child is
              currently widest (the action buttons one moment, a mistake
              banner's text the next), making the board visibly resize
              between states instead of holding a stable size. */}
          <div className="flex w-full max-w-[min(86vw,24rem)] flex-col items-center gap-4">
            {children}
            {actions ? <div className="flex items-center justify-center gap-2">{actions}</div> : null}
            {feedback ? <div className="w-full max-w-[min(86vw,24rem)]">{feedback}</div> : null}
          </div>

          <div className="w-full rounded-xl border bg-card lg:w-72 lg:shrink-0">
            <button
              type="button"
              onClick={() => setRulesOpen((open) => !open)}
              aria-expanded={rulesOpen}
              className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium"
            >
              How to play
              <ChevronDown
                className={cn('size-4 shrink-0 transition-transform', rulesOpen && 'rotate-180')}
                aria-hidden="true"
              />
            </button>
            {rulesOpen ? (
              <ul className="flex flex-col gap-2 border-t px-4 py-3 text-sm text-muted-foreground">
                {rules.map((rule, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden="true">•</span>
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
