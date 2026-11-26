'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Flame } from 'lucide-react';
import { DotLottie, DotLottieReact } from '@lottiefiles/dotlottie-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { Progress } from '@/components/ui/progress';
import { TechniqueNote } from '@/components/technique-note';
import { cn } from '@/lib/utils';
import { useDashboardStreak } from '@/lib/dashboard/use-dashboard';

/**
 * Engagement nudge, not a health-risk signal — deliberately restricted to
 * good/warning/secondary. RiskLevelBadge's serious/critical variants are
 * reserved for clinical severity elsewhere in the app; reusing them here
 * would make a missed check-in read as a health-risk warning.
 */
function streakBadge(
  currentStreak: number,
  lapsed: boolean,
): { variant: 'good' | 'warning' | 'secondary'; label: string } {
  // No-blame re-entry after a lapse — needs clinician review.
  if (lapsed) return { variant: 'secondary', label: 'Welcome back' };
  if (currentStreak >= 7) return { variant: 'good', label: 'On a roll' };
  if (currentStreak >= 1) return { variant: 'warning', label: 'Keep it going' };
  return { variant: 'secondary', label: 'Start today' };
}

const STREAK_MILESTONES = [
  { days: 3, label: 'Star', emoji: '⭐' },
  { days: 5, label: 'Superstar', emoji: '🌟' },
  { days: 7, label: 'Champion', emoji: '🏆' },
  { days: 31, label: 'Icon', emoji: '🏅' },
  { days: 50, label: 'Hall of Fame', emoji: '🔥' },
  { days: 100, label: 'Invincible', emoji: '🛡️' },
  { days: 150, label: 'Legend', emoji: '⚔️' },
  { days: 200, label: 'Golden', emoji: '🥇' },
  { days: 250, label: 'Visionary', emoji: '🔭' },
  { days: 300, label: 'Supreme', emoji: '💎' },
  { days: 365, label: 'Interstellar', emoji: '🌌' },
] as const;

export function StreakCard({ showConfetti = false }: { showConfetti?: boolean }) {
  const streak = useDashboardStreak();
  const badge = streak.data ? streakBadge(streak.data.currentStreak, streak.data.lapsed) : null;
  const currentMilestoneRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(showConfetti);

  useEffect(() => {
    if (showConfetti) setPlaying(true);
  }, [showConfetti]);

  const playCountRef = useRef(0);

  const onLottieRef = useCallback((dl: DotLottie | null) => {
    if (!dl) return;
    playCountRef.current = 0;
    dl.addEventListener('complete', () => {
      playCountRef.current += 1;
      if (playCountRef.current >= 5) {
        setPlaying(false);
      } else {
        dl.play();
      }
    });
  }, []);

  // Check-in window opens at 9 am local time and stays open all day.
  const isAfter9am = new Date().getHours() >= 9;
  const canCheckIn = !streak.data?.completedToday && isAfter9am;
  const beforeWindow = !streak.data?.completedToday && !isAfter9am;

  // Scroll the user's current milestone into view so they don't have to hunt
  // for it when they have a long streak.
  useEffect(() => {
    currentMilestoneRef.current?.scrollIntoView?.({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, [streak.data?.currentStreak]);

  return (
    <Card
      id="dailypulse"
      style={{ scrollMarginTop: 'calc(var(--header-height, 4rem) + 1rem)' }}
      className="relative overflow-hidden border-primary/30 bg-gradient-to-br from-primary/[0.07] via-card to-card shadow-md shadow-primary/5 ring-1 ring-primary/10"
    >
      {playing && (
        <div className="pointer-events-none absolute inset-0 z-20" aria-hidden="true">
          <DotLottieReact
            src="/animations/confetti.lottie"
            autoplay
            loop={false}
            style={{ width: '100%', height: '100%' }}
            dotLottieRefCallback={onLottieRef}
          />
        </div>
      )}
      <CardHeader className="flex flex-row items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Flame className="size-5" aria-hidden="true" />
        </div>
        <div className="space-y-0.5">
          <CardTitle className="text-base">Daily streak</CardTitle>
          <CardDescription>
            {streak.data?.lapsed
              ? 'Good to see you again. Pick up whenever you like.'
              : 'Check in every day to keep it alive.'}
          </CardDescription>
        </div>
        {canCheckIn ? (
          <CardAction className="ml-auto">
            <Button asChild size="sm">
              <Link href="/assessments/daily-pulse">
                Today&apos;s check-in <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </Button>
          </CardAction>
        ) : beforeWindow ? (
          <span className="ml-auto text-xs text-muted-foreground">Available at 9 am</span>
        ) : null}
      </CardHeader>
      <CardContent>
        {streak.isLoading ? (
          <LoadingState label="Loading your streak…" />
        ) : streak.isError ? (
          <ErrorState description="Could not load your streak." onRetry={() => streak.refetch()} />
        ) : streak.data && badge ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline gap-2">
              <p className="text-4xl font-semibold tabular-nums">{streak.data.currentStreak}</p>
              <p className="text-sm text-muted-foreground">{streak.data.currentStreak === 1 ? 'day' : 'days'} in a row</p>
              <Badge variant={badge.variant} className="ml-auto">
                {badge.label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {streak.data.totalActiveDays} active {streak.data.totalActiveDays === 1 ? 'day' : 'days'} in total
            </p>
            <MilestoneProgress currentStreak={streak.data.currentStreak} />
            <p className="text-xs text-muted-foreground">
              {streak.data.lapsed && !streak.data.completedToday ? (
                <WelcomeBackSubtext />
              ) : (
                <MilestoneSubtext
                  currentStreak={streak.data.currentStreak}
                  completedToday={streak.data.completedToday}
                />
              )}
            </p>
            <MilestoneBadgeRow currentStreak={streak.data.currentStreak} currentMilestoneRef={currentMilestoneRef} />
            <TechniqueNote feature="streak" />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function getMilestoneWindow(currentStreak: number) {
  const currentIndex = [...STREAK_MILESTONES].reverse().findIndex((m) => currentStreak >= m.days);
  const current = currentIndex === -1 ? null : STREAK_MILESTONES[STREAK_MILESTONES.length - 1 - currentIndex];
  const next = STREAK_MILESTONES.find((m) => m.days > currentStreak) ?? null;
  const prevDay = current?.days ?? 0;
  const nextDay = next?.days ?? null;
  return { current, next, prevDay, nextDay };
}

function MilestoneProgress({ currentStreak }: { currentStreak: number }) {
  const { next, prevDay, nextDay } = getMilestoneWindow(currentStreak);
  const progressPct = next && nextDay !== null
    ? Math.min(100, ((currentStreak - prevDay) / (nextDay - prevDay)) * 100)
    : 100;
  const ariaLabel = next
    ? `${currentStreak - prevDay} of ${(nextDay ?? 0) - prevDay} days toward ${next.label}`
    : 'All milestones achieved';

  return <Progress value={progressPct} aria-label={ariaLabel} />;
}

/**
 * Lighter suggestion after a lapse: one quick check-in, no catching up, and
 * the days already logged still count. Needs clinician review.
 */
function WelcomeBackSubtext() {
  return <>A quick check-in today is plenty. The days you&apos;ve already logged still count.</>;
}

function MilestoneSubtext({ currentStreak, completedToday }: { currentStreak: number; completedToday: boolean }) {
  const { next, nextDay } = getMilestoneWindow(currentStreak);
  if (completedToday) return <>You&apos;ve checked in today — nice work.</>;
  if (next && nextDay !== null) {
    const remaining = nextDay - currentStreak;
    return <>{remaining} more {remaining === 1 ? 'day' : 'days'} to {next.label}</>;
  }
  return <>All milestones achieved — legendary!</>;
}

function MilestoneBadgeRow({
  currentStreak,
  currentMilestoneRef,
}: {
  currentStreak: number;
  currentMilestoneRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { current } = getMilestoneWindow(currentStreak);

  return (
    <div className="flex gap-1.5 overflow-x-auto border-t pt-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {STREAK_MILESTONES.map((milestone) => {
        const earned = currentStreak >= milestone.days;
        const isCurrent = current?.days === milestone.days;
        return (
          <div
            key={milestone.days}
            ref={isCurrent ? currentMilestoneRef : undefined}
            aria-label={`${milestone.label} — ${earned ? 'earned' : `unlock at ${milestone.days} days`}`}
            className={cn(
              'relative flex shrink-0 flex-col items-center gap-1 rounded-xl px-3 py-2 transition-all',
              earned ? 'badge-shimmer' : '',
              isCurrent && 'bg-primary/10 ring-1 ring-primary/20',
            )}
            style={earned ? undefined : { filter: 'grayscale(1) opacity(0.45)' }}
          >
            <span
              className="relative z-10 text-2xl leading-none"
              role="img"
              aria-hidden="true"
              style={earned ? { filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.35))' } : undefined}
            >
              {milestone.emoji}
            </span>
            <span className="relative z-10 text-[12px] font-medium tabular-nums">{milestone.days}d</span>
            <span className="relative z-10 whitespace-nowrap text-[12px] leading-tight text-muted-foreground">{milestone.label}</span>
          </div>
        );
      })}
    </div>
  );
}
