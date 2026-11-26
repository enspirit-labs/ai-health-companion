'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HEALTH_PROFILE_QUESTION_COPY, HEALTH_PROFILE_QUESTION_ORDER } from '@aidoctor/shared';
import { ClipboardList } from 'lucide-react';

import { CompletionCard } from '@/components/completion-card';
import { ErrorState } from '@/components/error-state';
import { HealthProfileIntroCard } from '@/components/health-profile-intro';
import { HealthProfileQuestion } from '@/components/health-profile-question';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { QuestionFlow } from '@/components/questionnaire/question-flow';
import { useAnswerHealthProfileQuestion, useHealthProfile } from '@/lib/health-profile/use-health-profile';

export default function HealthProfileOnboardingPage() {
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useHealthProfile();
  const answerQuestion = useAnswerHealthProfileQuestion();
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  // Flips true → false exactly once, on the intro card's CTA — never reset by
  // Back navigation, so revisiting question 1 shows its form, not the intro again.
  const [showIntro, setShowIntro] = useState(true);

  useEffect(() => {
    if (data?.isComplete) {
      // Straight to the dashboard would be empty and anticlimactic for a
      // brand-new user — send them to pick their first assessment instead
      // (skippable from there, not a hard gate).
      const timeout = setTimeout(() => router.push('/assessments'), 1200);
      return () => clearTimeout(timeout);
    }
  }, [data?.isComplete, router]);

  useEffect(() => {
    if (stepIndex !== null || !data) return;
    const resumeIndex = data.nextQuestion
      ? HEALTH_PROFILE_QUESTION_ORDER.indexOf(data.nextQuestion)
      : HEALTH_PROFILE_QUESTION_ORDER.length;
    setStepIndex(resumeIndex === -1 ? 0 : resumeIndex);
  }, [data, stepIndex]);

  // stepIndex resolves one tick after `data` loads (via the effect above) — also
  // gating on it here avoids a one-render flash of question 1 (or the intro
  // card, once added below) for a returning user before the real resume index lands.
  if (isLoading || !data || stepIndex === null) {
    return (
      <main id="main-content" className="flex flex-1 items-center justify-center">
        {isError ? (
          <ErrorState description="Could not load your health profile." onRetry={() => refetch()} />
        ) : (
          <LoadingState label="Loading…" variant="page" />
        )}
      </main>
    );
  }

  const currentIndex = stepIndex;
  const currentKey = HEALTH_PROFILE_QUESTION_ORDER[currentIndex];
  const showIntroCard = showIntro && currentIndex === 0 && currentKey;

  const header = (
    <PageHeader
      title="Health profile"
      icon={ClipboardList}
      description="Used to personalize your results and flag anything worth a closer look."
    />
  );

  return (
    <main id="main-content" className="flex flex-1 flex-col">
      {showIntroCard ? null : <div className="mx-auto w-full max-w-xl px-4 pt-10">{header}</div>}
      {showIntroCard ? (
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-10">
          <HealthProfileIntroCard onContinue={() => setShowIntro(false)} />
        </div>
      ) : currentKey ? (
        <QuestionFlow
          questionKey={currentKey}
          prompt={HEALTH_PROFILE_QUESTION_COPY[currentKey]}
          stepNumber={currentIndex + 1}
          totalSteps={HEALTH_PROFILE_QUESTION_ORDER.length}
          onBack={currentIndex > 0 ? () => setStepIndex(currentIndex - 1) : undefined}
          center={false}
        >
          <HealthProfileQuestion
            questionKey={currentKey}
            profile={data.profile}
            isSubmitting={answerQuestion.isPending}
            onSubmit={(patch) =>
              answerQuestion.mutate(patch, { onSuccess: () => setStepIndex(currentIndex + 1) })
            }
          />
        </QuestionFlow>
      ) : (
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center">
          <CompletionCard title="All set! Let's pick your first assessment…" />
        </div>
      )}
    </main>
  );
}
