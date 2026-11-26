'use client';

import { useMemo, useState } from 'react';
import {
  ASSESSMENT_LABELS,
  ASSESSMENT_TYPES,
  isAssessmentTypeHidden,
  rankRecommendationsByGoals,
} from '@aidoctor/shared';
import { Sparkles } from 'lucide-react';

import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { ListItemSkeleton } from '@/components/list-item-skeleton';
import { PageHeader } from '@/components/page-header';
import { RecommendationsFeed } from '@/components/dashboard/recommendations-feed';
import { ResultCount } from '@/components/result-count';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDashboardRecommendations } from '@/lib/dashboard/use-dashboard';
import { useGoals } from '@/lib/goals/use-goals';

const PRIORITY_OPTIONS = ['HIGH', 'MEDIUM', 'LOW'] as const;

export default function RecommendationsPage() {
  const recommendations = useDashboardRecommendations();
  const [assessmentFilter, setAssessmentFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');

  const goals = useGoals().data?.goals ?? [];
  const [onlyMyGoals, setOnlyMyGoals] = useState(false);

  // Goal-related guidance floats to the top; the optional switch hides the rest.
  const filtered = useMemo(() => {
    const matching = (recommendations.data ?? []).filter(
      (rec) =>
        (assessmentFilter === 'ALL' || rec.sourceAssessment === assessmentFilter) &&
        (priorityFilter === 'ALL' || rec.priority === priorityFilter),
    );
    return rankRecommendationsByGoals(matching, goals, { onlyGoalRelated: onlyMyGoals });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recommendations.data, assessmentFilter, priorityFilter, onlyMyGoals, goals.join(',')]);

  return (
    <main id="main-content" className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">
      <PageHeader
        title="Recommendations"
        description="All the AI guidance generated from your assessments, highest priority first."
      />

      <div className="flex flex-wrap gap-3">
        <Select value={assessmentFilter} onValueChange={setAssessmentFilter}>
          <SelectTrigger className="w-48" aria-label="Filter by assessment">
            <SelectValue placeholder="All assessments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All assessments</SelectItem>
            {ASSESSMENT_TYPES.filter((type) => !isAssessmentTypeHidden(type)).map((type) => (
              <SelectItem key={type} value={type}>
                {ASSESSMENT_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-40" aria-label="Filter by priority">
            <SelectValue placeholder="All priorities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All priorities</SelectItem>
            {PRIORITY_OPTIONS.map((priority) => (
              <SelectItem key={priority} value={priority}>
                {priority.charAt(0) + priority.slice(1).toLowerCase()} priority
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {goals.length > 0 ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyMyGoals}
              onChange={(e) => setOnlyMyGoals(e.target.checked)}
              className="size-4"
            />
            Only guidance for my goals
          </label>
        ) : null}
      </div>

      {recommendations.isLoading ? (
        <ListItemSkeleton label="Loading recommendations…" />
      ) : recommendations.isError ? (
        <ErrorState description="Could not load your recommendations." onRetry={() => recommendations.refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          message={
            (recommendations.data ?? []).length === 0
              ? 'Complete an assessment to get personalized AI recommendations.'
              : 'No recommendations match these filters.'
          }
        />
      ) : (
        <>
          <ResultCount shown={filtered.length} total={(recommendations.data ?? []).length} />
          <RecommendationsFeed recommendations={filtered} />
        </>
      )}

    </main>
  );
}
