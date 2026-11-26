'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { Flame, Lightbulb, Trophy } from 'lucide-react';
import { DotLottie, DotLottieReact } from '@lottiefiles/dotlottie-react';

import { Button } from '@/components/ui/button';
import { useDashboardStreak } from '@/lib/dashboard/use-dashboard';
import { formatDuration } from './game-shell';

interface Stat {
  label: string;
  value: string;
}

interface GameCompletionProps {
  title: string;
  /** e.g. "Tango" — names the puzzle that was solved. */
  gameLabel: string;
  elapsedMs: number;
  hintsUsed: number;
  /** Extra game-specific stats, e.g. Pinpoint's "Solved in 3". */
  extraStats?: Stat[];
}

/**
 * Shared win state for every pulse game. Mirrors what LinkedIn does at the end
 * of a round — name the puzzle, show the time, and immediately connect it to
 * the streak — because the streak is the reason to come back tomorrow, and
 * this is the one moment the player is guaranteed to be looking.
 */
export function GameCompletion({
  title,
  gameLabel,
  elapsedMs,
  hintsUsed,
  extraStats = [],
}: GameCompletionProps) {
  const streak = useDashboardStreak();
  const [playingConfetti, setPlayingConfetti] = useState(true);
  const playCountRef = useRef(0);

  // Matches StreakCard's loop handling: replay a few times, then stop, rather
  // than looping forever behind the stats.
  const onLottieRef = useCallback((dl: DotLottie | null) => {
    if (!dl) return;
    playCountRef.current = 0;
    dl.addEventListener('complete', () => {
      playCountRef.current += 1;
      if (playCountRef.current >= 3) setPlayingConfetti(false);
      else dl.play();
    });
  }, []);

  const stats: Stat[] = [
    { label: 'Time', value: formatDuration(elapsedMs) },
    ...extraStats,
    { label: 'Hints used', value: String(hintsUsed) },
  ];

  return (
    <div
      role="status"
      className="relative w-full overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card p-6 text-center shadow-md"
    >
      {playingConfetti ? (
        <div className="pointer-events-none absolute inset-0 z-10" aria-hidden="true">
          <DotLottieReact
            src="/animations/confetti.lottie"
            autoplay
            loop={false}
            style={{ width: '100%', height: '100%' }}
            dotLottieRefCallback={onLottieRef}
          />
        </div>
      ) : null}

      <div className="relative z-20 flex flex-col items-center gap-4">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Trophy className="size-6" aria-hidden="true" />
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{gameLabel}</p>
          <p className="text-xl font-semibold">{title}</p>
        </div>

        <dl className="flex w-full items-stretch justify-center gap-2">
          {stats.map((stat) => (
            <div key={stat.label} className="flex-1 rounded-xl border bg-background/70 px-2 py-3">
              <dt className="text-[11px] text-muted-foreground">{stat.label}</dt>
              <dd className="text-base font-semibold tabular-nums">{stat.value}</dd>
            </div>
          ))}
        </dl>

        {streak.data ? (
          // Icon and text as separate flex items made the flame vertically
          // center against the *whole* wrapped block once the sentence ran to
          // two lines, instead of sitting flush with the first line. Keeping
          // both text pieces in one child lets them wrap as continuous prose,
          // with items-start pinning the icon to that first line — same
          // pattern as the icon+paragraph rows in HintPanel/GameFeedback.
          <p className="flex items-start justify-center gap-1.5 text-center text-sm">
            <Flame className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <span>
              <span className="font-medium">
                {streak.data.currentStreak} day{streak.data.currentStreak === 1 ? '' : 's'} in a row
              </span>{' '}
              <span className="text-muted-foreground">— come back tomorrow to keep it alive.</span>
            </span>
          </p>
        ) : null}

        {hintsUsed === 0 ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lightbulb className="size-3.5" aria-hidden="true" />
            Solved without a single hint.
          </p>
        ) : null}

        <Button asChild className="mt-1 w-full sm:w-auto">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
