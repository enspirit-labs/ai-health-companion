import Link from 'next/link';
import { ASSESSMENT_DESCRIPTIONS, ASSESSMENT_LABELS } from '@aidoctor/shared';
import type { AssessmentType } from '@aidoctor/shared';
import { Check, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ASSESSMENT_ICONS } from '@/lib/assessments/assessment-icons';
import { slugFromAssessmentType } from '@/lib/assessments/type-slug';

export function AssessmentTypeCard({
  type,
  isCompleted,
}: {
  type: AssessmentType;
  isCompleted: boolean;
}) {
  const Icon = ASSESSMENT_ICONS[type];

  return (
    <div className="relative flex flex-col items-center gap-3 rounded-xl border bg-card p-4 text-center sm:p-5">
      {isCompleted ? (
        <span
          className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full bg-status-good/15 text-status-good"
          aria-label="Completed"
        >
          <Check className="size-3" aria-hidden="true" />
        </span>
      ) : null}
      <Icon className="size-8 shrink-0 text-primary" aria-hidden="true" />
      <div>
        <p className="text-sm font-medium">{ASSESSMENT_LABELS[type]}</p>
        <p className="mt-1 text-xs text-muted-foreground">{ASSESSMENT_DESCRIPTIONS[type]}</p>
      </div>
      <Button asChild variant={isCompleted ? 'outline' : 'default'} size="sm" className="mt-auto">
        <Link href={`/assessments/${slugFromAssessmentType(type)}`}>
          {isCompleted ? (
            <>
              <RotateCcw className="size-3.5" /> Retake
            </>
          ) : (
            'Start'
          )}
        </Link>
      </Button>
    </div>
  );
}
