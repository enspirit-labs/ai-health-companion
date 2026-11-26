'use client';

import Link from 'next/link';
import { ArrowRight, Compass, Sparkles } from 'lucide-react';
import { ASSESSMENT_DESCRIPTIONS, ASSESSMENT_LABELS, isAssessmentTypeFlaggedOff } from '@aidoctor/shared';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { ASSESSMENT_ICONS } from '@/lib/assessments/assessment-icons';
import { slugFromAssessmentType } from '@/lib/assessments/type-slug';
import { useRecommendedAssessment } from '@/lib/dashboard/use-dashboard';
import { useFeatureFlags } from '@/lib/feature-flags/use-feature-flags';
import { PulseGameTeaser } from './pulse-game-teaser';

/**
 * A separate, additive discovery layer alongside Daily Pulse. Recommends a
 * stale assessment (never MENTAL_WELLNESS — that's already the Daily Pulse
 * card's job) until today's Daily Pulse is complete, then switches to a
 * generated game themed on today's answers — the backend decides which
 * (`kind`), this just renders whichever it returns.
 */
export function RecommendedAssessmentCard() {
  const recommended = useRecommendedAssessment();
  const data = recommended.data;
  const { data: featureFlags } = useFeatureFlags();
  // A flag-gated type (Voice, Tongue) that's switched off is never suggested —
  // its start endpoint would 404.
  const type =
    data?.kind === 'ASSESSMENT' && !isAssessmentTypeFlaggedOff(data.type, featureFlags) ? data.type : undefined;
  const Icon = type ? ASSESSMENT_ICONS[type] : null;
  const isGame = data?.kind === 'GAME';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          {isGame ? <Sparkles className="size-5" aria-hidden="true" /> : <Compass className="size-5" aria-hidden="true" />}
        </div>
        <div className="space-y-0.5">
          <CardTitle className="text-base">Something new to try</CardTitle>
          <CardDescription>
            {isGame ? "A quick game based on today's check-in." : 'A rotating suggestion alongside your daily check-in.'}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {recommended.isLoading ? (
          <LoadingState label="Loading a suggestion…" />
        ) : recommended.isError ? (
          <ErrorState description="Could not load a suggestion." onRetry={() => recommended.refetch()} />
        ) : data?.kind === 'GAME' ? (
          <PulseGameTeaser
            game={data.game}
            blurb={data.blurb}
            difficulty={data.difficulty}
            solvedToday={data.solvedToday}
          />
        ) : type && Icon ? (
          <div className="flex items-center gap-3">
            <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-sm font-medium">{ASSESSMENT_LABELS[type]}</p>
              <p className="text-xs text-muted-foreground">{ASSESSMENT_DESCRIPTIONS[type]}</p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href={`/assessments/${slugFromAssessmentType(type)}`}>
                Try it <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
