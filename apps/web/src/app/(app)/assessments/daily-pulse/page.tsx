'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { AiProcessingLoader } from '@/components/ai-processing-loader';
import { AssessmentQuestion, type AnswerValue } from '@/components/assessment-question';
import { Button } from '@/components/ui/button';
import { CompletionCard } from '@/components/completion-card';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { QuestionFlow } from '@/components/questionnaire/question-flow';
import { ClientApiError } from '@/lib/api/client-fetch';
import { ASSESSMENT_ICONS } from '@/lib/assessments/assessment-icons';
import {
  useAnswerAssessmentQuestion,
  useAssessmentState,
  useCompleteAssessment,
  useStartDailyPulse,
} from '@/lib/assessments/use-assessment';
import { useCurrentUser } from '@/lib/auth/use-auth';

/**
 * A trimmed, purpose-built version of `[type]/page.tsx`'s questionnaire
 * branch — always MENTAL_WELLNESS in PULSE mode, so there's no slug routing
 * or input-mode switch to handle. Reuses the same question components and
 * hooks as the full flow unmodified; they just render whatever 5-item
 * `questions` array the backend returns for this mode.
 */
export default function DailyPulsePage() {
  const router = useRouter();
  const { data: user } = useCurrentUser();

  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [notAvailable, setNotAvailable] = useState(false);
  // Which question the one-at-a-time flow is currently showing — separate
  // from the server's `answers` map so Back can revisit an already-answered
  // question without that being confused with "still unanswered". Null
  // until initialized from the server's own progress (see effect below).
  const [stepIndex, setStepIndex] = useState<number | null>(null);

  const start = useStartDailyPulse();
  const state = useAssessmentState(assessmentId);
  const answerQuestion = useAnswerAssessmentQuestion(assessmentId);
  const complete = useCompleteAssessment(assessmentId);

  const isReadyToComplete = state.data?.isReadyToComplete ?? false;
  const header = <PageHeader title="Daily Pulse" icon={ASSESSMENT_ICONS.MENTAL_WELLNESS} backHref="/dashboard" />;

  // Daily Pulse is reachable directly (bookmark, a future Slack reminder
  // deep link) — not only via the dashboard, which already gates on
  // hasHealthProfile before its Streak Card ever renders. Mirror that same
  // gate here so a user without a health profile yet can't land on a
  // capture flow before completing onboarding.
  useEffect(() => {
    if (user && !user.hasHealthProfile) {
      router.replace('/onboarding/health-profile');
    }
  }, [user, router]);

  useEffect(() => {
    // Wait for the auth query to resolve, and never start a capture for a
    // user the redirect effect above is about to send to onboarding.
    if (!user || !user.hasHealthProfile || assessmentId) return;
    start.mutate(undefined, {
      onSuccess: (data) => setAssessmentId(data.id),
      onError: (error) => {
        if (error instanceof ClientApiError && error.status === 404) {
          setNotAvailable(true);
        }
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Resume where the server says the user left off — the first load sets
  // the step to the first unanswered question exactly once; after that,
  // Back/Continue drive it locally.
  useEffect(() => {
    if (stepIndex !== null || !state.data || state.data.inputMode !== 'QUESTIONNAIRE') return;
    const { questions, nextQuestion } = state.data;
    const resumeIndex = nextQuestion ? questions.findIndex((q) => q.key === nextQuestion.key) : questions.length;
    setStepIndex(resumeIndex === -1 ? 0 : resumeIndex);
  }, [state.data, stepIndex]);

  // Auto-complete when all questions are answered. Daily Pulse is a habit
  // loop, not a diagnostic session, so there's no results to show — just a
  // brief confirmation card (below) before the user heads back on their own.
  useEffect(() => {
    if (!isReadyToComplete || complete.isPending || complete.data) return;
    complete.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReadyToComplete]);

  if (notAvailable) {
    return (
      <main id="main-content" className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
        <p role="status" className="text-lg font-medium">
          Daily Pulse isn&apos;t available yet
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Check back later, or explore the assessments already available from your dashboard.
        </p>
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </main>
    );
  }

  if (complete.isPending) {
    return (
      <main id="main-content" className="flex flex-1 flex-col">
        <AiProcessingLoader />
      </main>
    );
  }

  if (complete.isSuccess) {
    return (
      <main id="main-content" className="flex flex-1 flex-col">
        <div className="mx-auto w-full max-w-xl px-4 pt-10">{header}</div>
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-4 px-4 py-10 text-center">
          <CompletionCard
            title="Daily streak completed! Nice work today."
            actionLabel="Go to Dashboard"
            onAction={() => router.replace('/dashboard?celebrated=true#dailypulse')}
          />
        </div>
      </main>
    );
  }

  if (state.isError) {
    return (
      <main id="main-content" className="flex flex-1 items-center justify-center">
        <ErrorState description="Could not load today's check-in." onRetry={() => state.refetch()} />
      </main>
    );
  }

  if (!state.data) {
    return (
      <main id="main-content" className="flex flex-1 items-center justify-center">
        <LoadingState label="Loading…" variant="page" />
      </main>
    );
  }

  const { questions, answers } = state.data;
  const currentIndex = stepIndex ?? 0;
  const currentQuestion = questions[currentIndex];

  return (
    <main id="main-content" className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-xl px-4 pt-10">{header}</div>
      {currentQuestion ? (
        <QuestionFlow
          questionKey={currentQuestion.key}
          prompt={currentQuestion.prompt}
          stepNumber={currentIndex + 1}
          totalSteps={questions.length}
          onBack={currentIndex > 0 ? () => setStepIndex(currentIndex - 1) : undefined}
          center={false}
        >
          <AssessmentQuestion
            question={currentQuestion}
            value={answers[currentQuestion.key] as AnswerValue | undefined}
            isSubmitting={answerQuestion.isPending}
            onSubmit={(answer) =>
              answerQuestion.mutate(
                { questionKey: currentQuestion.key, answer },
                { onSuccess: () => setStepIndex(currentIndex + 1) },
              )
            }
          />
        </QuestionFlow>
      ) : (
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-4 px-4 py-10 text-center" />
      )}
    </main>
  );
}
