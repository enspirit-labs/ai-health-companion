import type { AssessmentModule, AssessmentType } from '@aidoctor/shared';
import { isAssessmentTypeFlaggedOff, isAssessmentTypeHidden } from '@aidoctor/shared';
import { Check } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { ASSESSMENT_MODULE_ICONS } from '@/lib/assessments/assessment-module-icons';
import { AssessmentTypeCard } from '@/components/assessments/assessment-type-card';
import { useFeatureFlags } from '@/lib/feature-flags/use-feature-flags';

export function AssessmentModuleSection({
  module,
  isCompleted,
}: {
  module: AssessmentModule;
  isCompleted: (type: AssessmentType) => boolean;
}) {
  const Icon = ASSESSMENT_MODULE_ICONS[module.id];
  const { data: featureFlags } = useFeatureFlags();
  const visibleTypes = module.types.filter(
    (type) => !isAssessmentTypeHidden(type) && !isAssessmentTypeFlaggedOff(type, featureFlags),
  );
  const completedCount = visibleTypes.filter((type) => isCompleted(type)).length;
  const headingId = `module-${module.id}-heading`;

  if (visibleTypes.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon className="size-4.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id={headingId} className="text-base font-medium">
              {module.label}
            </h2>
            <p className="text-xs text-muted-foreground">{module.description}</p>
          </div>
        </div>
        {completedCount > 0 ? (
          <div className="shrink-0">
            {completedCount === visibleTypes.length ? (
              <Badge variant="good">
                <Check className="size-3" aria-hidden="true" />
                All complete
              </Badge>
            ) : (
              <p className="text-xs text-muted-foreground">
                {completedCount} of {visibleTypes.length} complete
              </p>
            )}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {visibleTypes.map((type) => (
          <AssessmentTypeCard key={type} type={type} isCompleted={isCompleted(type)} />
        ))}
      </div>
    </section>
  );
}
