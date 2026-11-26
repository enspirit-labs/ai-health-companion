'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { QuestionFlow } from '@/components/questionnaire/question-flow';
import { cn } from '@/lib/utils';

interface Props {
  isSubmitting: boolean;
  onComplete: (result: { score: number; severity: string }) => void;
}

// Question keys are unchanged from the original questionnaire so stored
// answers stay comparable; only the wording moved to screen-habit language.
const QUESTIONS = [
  { key: 'grittiness', prompt: 'Do your eyes feel scratchy after a long stretch of screen time?' },
  { key: 'burning', prompt: 'Do your eyes sting after reading or screen work?' },
  { key: 'lightSensitivity', prompt: 'Do bright screens or lights feel uncomfortable?' },
  { key: 'screenDiscomfort', prompt: 'Do your eyes feel tired after screen use?' },
  { key: 'blurryByEvening', prompt: 'Does focusing on your screen feel harder by the end of the day?' },
];

const FREQUENCY_OPTIONS = [
  { label: 'Never', value: 0 },
  { label: 'Rarely', value: 1 },
  { label: 'Sometimes', value: 2 },
  { label: 'Often', value: 3 },
  { label: 'Always', value: 4 },
];

function severityForScore(score: number): string {
  if (score <= 4) return 'Comfortable';
  if (score <= 9) return 'Mostly comfortable';
  if (score <= 15) return 'Some discomfort';
  return 'Frequent discomfort';
}

export function ScreenComfortQuestionnaire({ isSubmitting, onComplete }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});

  const question = QUESTIONS[stepIndex];
  const selected = question ? answers[question.key] : undefined;

  function handleContinue() {
    if (selected === undefined) return;
    const next = { ...answers };
    if (stepIndex < QUESTIONS.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      const score = Object.values(next).reduce((sum, v) => sum + v, 0);
      onComplete({ score, severity: severityForScore(score) });
    }
  }

  if (!question) return null;

  return (
    <QuestionFlow
      questionKey={question.key}
      prompt={question.prompt}
      eyebrow="Screen-comfort habits"
      stepNumber={stepIndex + 1}
      totalSteps={QUESTIONS.length}
      onBack={stepIndex > 0 ? () => setStepIndex(stepIndex - 1) : undefined}
      center={false}
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          handleContinue();
        }}
      >
        <div className="flex flex-col gap-2">
          {FREQUENCY_OPTIONS.map((option) => {
            const isActive = selected === option.value;
            return (
              <button
                key={option.label}
                type="button"
                disabled={isSubmitting}
                onClick={() => setAnswers((prev) => ({ ...prev, [question.key]: option.value }))}
                className={cn(
                  'cursor-pointer rounded-lg border px-4 py-3 text-left text-base transition-colors disabled:cursor-not-allowed',
                  isActive ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent',
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <Button
          size="lg"
          type="submit"
          className="w-fit"
          disabled={selected === undefined || isSubmitting}
        >
          {stepIndex < QUESTIONS.length - 1 ? 'Continue' : 'Done'}
        </Button>
      </form>
    </QuestionFlow>
  );
}
