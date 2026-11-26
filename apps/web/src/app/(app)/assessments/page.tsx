'use client';

import { ASSESSMENT_MODULES } from '@aidoctor/shared';
import type { AssessmentType } from '@aidoctor/shared';

import { PageHeader } from '@/components/page-header';
import { AssessmentModuleSection } from '@/components/assessments/assessment-module-section';
import { useUpcomingAssessments } from '@/lib/dashboard/use-dashboard';

/**
 * Doubles as the post-onboarding picker (see onboarding/health-profile/page.tsx's
 * redirect) and the dashboard's "view all assessments" destination — completed
 * modules show a Retake CTA and a checkmark badge instead of just disappearing,
 * since the dashboard's Upcoming assessments card only ever surfaces what's left.
 *
 * Assessments are grouped into modules (Visual, Physical & Movement, Vocal,
 * Mental & Cognitive, Lifestyle) per the 14-module breakdown documented at
 * https://enspirit.atlassian.net/wiki/spaces/ALPHA/pages/1840382012.
 */
export default function AssessmentsHubPage() {
  const upcoming = useUpcomingAssessments();
  const upcomingTypes = new Set(upcoming.data ?? []);

  // Until upcoming.data loads, assume not-yet-completed rather than flashing a
  // checkmark badge that might immediately disappear.
  const isCompleted = (type: AssessmentType) => (upcoming.data ? !upcomingTypes.has(type) : false);

  return (
    <main id="main-content" className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8">
      <PageHeader
        title="Assessments"
        description="Start a new assessment, or retake one you've already completed."
      />

      <div className="flex flex-col gap-10">
        {ASSESSMENT_MODULES.map((module) => (
          <AssessmentModuleSection key={module.id} module={module} isCompleted={isCompleted} />
        ))}
      </div>
    </main>
  );
}
