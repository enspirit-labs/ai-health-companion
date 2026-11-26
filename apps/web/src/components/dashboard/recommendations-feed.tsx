import { ASSESSMENT_LABELS } from '@aidoctor/shared';
import type { DashboardRecommendation } from '@aidoctor/shared';
import { Lightbulb, Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/empty-state';
import { RECOMMENDATION_PRIORITY_CONFIG } from '@/components/reports/recommendations-list';
import { ASSESSMENT_ICONS } from '@/lib/assessments/assessment-icons';
import { cn } from '@/lib/utils';

export function RecommendationsFeed({ recommendations }: { recommendations: DashboardRecommendation[] }) {
  if (recommendations.length === 0) {
    return <EmptyState icon={Sparkles} message="Complete an assessment to get personalized AI recommendations." />;
  }

  return (
    <ul className="space-y-3">
      {recommendations.map((rec, i) => {
        const SourceIcon = ASSESSMENT_ICONS[rec.sourceAssessment];
        const config = RECOMMENDATION_PRIORITY_CONFIG[rec.priority];
        return (
          <li key={i} className={cn('flex gap-3 rounded-lg border border-l-[3px] p-4', config.border)}>
            <div className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full', config.iconWrap)}>
              <Lightbulb className="size-4" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">{rec.title}</p>
                <Badge variant={config.badgeVariant}>{config.label}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{rec.detail}</p>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <SourceIcon className="size-3.5 shrink-0" aria-hidden="true" />
                From your {ASSESSMENT_LABELS[rec.sourceAssessment]}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
