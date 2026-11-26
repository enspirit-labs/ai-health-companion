import Link from 'next/link';
import {
  ASSESSMENT_DESCRIPTIONS,
  ASSESSMENT_LABELS,
  isAssessmentTypeFlaggedOff,
  isAssessmentTypeHidden,
} from '@aidoctor/shared';
import type { AssessmentType } from '@aidoctor/shared';
import { ArrowRight, PartyPopper } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import { ASSESSMENT_ICONS } from '@/lib/assessments/assessment-icons';
import { slugFromAssessmentType } from '@/lib/assessments/type-slug';
import { useFeatureFlags } from '@/lib/feature-flags/use-feature-flags';

export function UpcomingAssessmentsGrid({ types: allTypes }: { types: AssessmentType[] }) {
  const { data: featureFlags } = useFeatureFlags();
  const types = allTypes.filter(
    (type) => !isAssessmentTypeHidden(type) && !isAssessmentTypeFlaggedOff(type, featureFlags),
  );

  if (types.length === 0) {
    return (
      <EmptyState
        icon={PartyPopper}
        iconClassName="text-status-good"
        message="You've completed every assessment. Great work!"
      />
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {types.map((type) => {
        const Icon = ASSESSMENT_ICONS[type];
        return (
          <div key={type} className="flex flex-col gap-2 rounded-lg border p-4">
            <div className="flex items-center gap-2">
              <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
              <p className="text-sm font-medium">{ASSESSMENT_LABELS[type]}</p>
            </div>
            <p className="text-xs text-muted-foreground">{ASSESSMENT_DESCRIPTIONS[type]}</p>
            <Button asChild variant="outline" size="sm" className="mt-auto w-fit">
              <Link href={`/assessments/${slugFromAssessmentType(type)}`}>
                Start <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </div>
        );
      })}
    </div>
  );
}
