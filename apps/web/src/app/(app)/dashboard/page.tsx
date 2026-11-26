'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { ReportList } from '@/components/reports/report-list';
import { RiskLevelBadge } from '@/components/risk-level-badge';
import { StatCard } from '@/components/dashboard/stat-card';
import { dashboardDimensionHref, isDimensionTileVisible } from '@/lib/dashboard/dimension-links';
import { StreakCard } from '@/components/dashboard/streak-card';
import { RecommendedAssessmentCard } from '@/components/dashboard/recommended-assessment-card';
import { WellnessTrendChart } from '@/components/dashboard/wellness-trend-chart';
import { AssessmentHistoryList } from '@/components/dashboard/assessment-history-list';
import { UpcomingAssessmentsGrid } from '@/components/dashboard/upcoming-assessments-grid';
import { WeeklyActionsCard } from '@/components/weekly-actions-card';
import { RecommendationsFeed } from '@/components/dashboard/recommendations-feed';
import { useCurrentUser } from '@/lib/auth/use-auth';
import { useFeatureFlags } from '@/lib/feature-flags/use-feature-flags';
import {
  useAssessmentHistory,
  useDashboardRecommendations,
  useDashboardStreak,
  useDashboardSummary,
  useDashboardTrends,
  useRecentReports,
  useUpcomingAssessments,
} from '@/lib/dashboard/use-dashboard';

export default function DashboardPage() {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const { data: featureFlags } = useFeatureFlags();
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (window.location.search.includes('celebrated=true')) {
      setShowConfetti(true);
      router.replace('/dashboard');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summary = useDashboardSummary();
  const streak = useDashboardStreak(Boolean(featureFlags?.dailyPulse));
  const trends = useDashboardTrends(30);
  const history = useAssessmentHistory();
  const upcoming = useUpcomingAssessments();
  const reports = useRecentReports();
  const recommendations = useDashboardRecommendations();

  useEffect(() => {
    if (user && !user.hasHealthProfile) {
      router.replace('/onboarding/health-profile');
    }
  }, [user, router]);

return (
    <main id="main-content" className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">
      <PageHeader
        title={`Welcome back${user ? `, ${user.fullName.split(' ')[0]}` : ''}`}
        description="Here's your wellness overview."
      />

      <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
        <Card className="justify-center">
          <CardContent className="flex flex-col items-center gap-2 px-6 py-6 text-center">
            <p className="text-sm text-muted-foreground">Overall wellness score</p>
            {summary.isLoading ? (
              <Skeleton className="h-16 w-24" />
            ) : summary.isError ? (
              <ErrorState
                className="py-2"
                description="Could not load your wellness score."
                onRetry={() => summary.refetch()}
              />
            ) : summary.data?.hasData ? (
              <>
                <p className="text-6xl font-semibold tabular-nums">{Math.round(summary.data.overallScore!)}</p>
                {summary.data.riskLevel ? <RiskLevelBadge riskLevel={summary.data.riskLevel} /> : null}
                <p className="text-xs text-muted-foreground">
                  Based on your latest {summary.data.includedTypes.length}{' '}
                  {summary.data.includedTypes.length === 1 ? 'assessment' : 'assessments'}
                </p>
              </>
            ) : (
              <>
                <p className="text-6xl font-semibold text-muted-foreground/40">—</p>
                <p className="text-xs text-muted-foreground">Complete an assessment to see your score</p>
              </>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {summary.isLoading
            ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)
            : (summary.data?.dimensions ?? [])
                .filter((d) => isDimensionTileVisible(d.key, d.score, featureFlags))
                .map((d) => (
                  <StatCard
                    key={d.key}
                    label={d.label}
                    score={d.score}
                    href={dashboardDimensionHref(d.key, d.score, featureFlags)}
                  />
                ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Wellness trend</CardTitle>
          <CardDescription>Your overall score over the last 30 days.</CardDescription>
        </CardHeader>
        <CardContent>
          {trends.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : trends.isError ? (
            <ErrorState description="Could not load your wellness trend." onRetry={() => trends.refetch()} />
          ) : (
            <WellnessTrendChart data={trends.data ?? []} />
          )}
        </CardContent>
      </Card>

      <WeeklyActionsCard lapsed={streak.data?.lapsed ?? false} />

      {featureFlags?.dailyPulse ? (
        <div className="grid gap-4 md:grid-cols-2">
          <StreakCard showConfetti={showConfetti} />
          <RecommendedAssessmentCard />
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Upcoming assessments</CardTitle>
            <CardDescription>Modules you haven&apos;t completed yet.</CardDescription>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link href="/assessments">View all</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {upcoming.isLoading ? (
              <LoadingState label="Loading upcoming assessments…" />
            ) : upcoming.isError ? (
              <ErrorState description="Could not load upcoming assessments." onRetry={() => upcoming.refetch()} />
            ) : (
              <UpcomingAssessmentsGrid types={upcoming.data ?? []} />
            )}
          </CardContent>
        </Card>

        <Card className="border-primary/30 bg-gradient-to-br from-primary/[0.07] via-card to-card shadow-md shadow-primary/5 ring-1 ring-primary/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Sparkles className="size-3.5" aria-hidden="true" />
              </div>
              AI Recommendations
            </CardTitle>
            <CardDescription>Your top guidance, highest priority first</CardDescription>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link href="/recommendations">View all</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {recommendations.isLoading ? (
              <LoadingState label="Loading recommendations…" />
            ) : recommendations.isError ? (
              <ErrorState description="Could not load your recommendations." onRetry={() => recommendations.refetch()} />
            ) : (
              // Already priority-sorted server-side — the top 3 are the most
              // important ones, not an arbitrary slice. A dashboard should
              // surface what matters most at a glance, not archive everything.
              <RecommendationsFeed recommendations={(recommendations.data ?? []).slice(0, 3)} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Assessment history</CardTitle>
            <CardDescription>Your completed wellness assessments.</CardDescription>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link href="/assessments/history">View all</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {history.isLoading ? (
              <LoadingState label="Loading assessment history…" />
            ) : history.isError ? (
              <ErrorState description="Could not load your assessment history." onRetry={() => history.refetch()} />
            ) : (
              <AssessmentHistoryList items={(history.data ?? []).slice(0, 4)} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent reports</CardTitle>
            <CardDescription>Generated wellness reports.</CardDescription>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link href="/reports">View all</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {reports.isLoading ? (
              <LoadingState label="Loading recent reports…" />
            ) : reports.isError ? (
              <ErrorState description="Could not load your recent reports." onRetry={() => reports.refetch()} />
            ) : (
              <ReportList
                reports={reports.data ?? []}
                dateStyle="date"
                emptyState={
                  <EmptyState
                    icon={FileText}
                    message="No reports yet. These are generated after your first completed assessment."
                  />
                }
              />
            )}
          </CardContent>
        </Card>
      </div>

    </main>
  );
}
