'use client';

import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';

import { Progress } from '@/components/ui/progress';

/**
 * Typeform/Tally-style shell: one question fills the screen at a time —
 * large prompt text, generous whitespace, nothing else competing for
 * attention — instead of the old growing chat transcript of every question
 * answered so far. Shared by the onboarding health-profile flow and the
 * questionnaire-mode assessments (Mental Wellness, Lifestyle); the specific
 * input widget (text field, choice buttons, etc.) is passed as children so
 * this component only owns the "one at a time" framing, not the answer UI.
 */
export function QuestionFlow({
  questionKey,
  prompt,
  eyebrow,
  stepNumber,
  totalSteps,
  onBack,
  center = true,
  children,
}: {
  /** Changing this re-triggers the slide/fade transition — pass the question's own key. */
  questionKey: string;
  prompt: ReactNode;
  /** Small quiet label above the progress bar (e.g. the assessment's name) — orientation, not navigation. */
  eyebrow?: ReactNode;
  stepNumber: number;
  totalSteps: number;
  /** Omit to hide the back control (e.g. on the very first question). */
  onBack?: () => void;
  /** Vertically centers the question in the available space. Set false when a page header sits above this — centering would otherwise leave a dead gap between the two. */
  center?: boolean;
  children: ReactNode;
}) {
  const progressValue = totalSteps > 0 ? (stepNumber / totalSteps) * 100 : 0;

  return (
    <div
      className={`mx-auto flex w-full max-w-xl flex-1 flex-col gap-10 px-4 py-10 ${center ? 'justify-center' : 'justify-start'}`}
    >
      <div className="space-y-2">
        {eyebrow ? <p className="text-center text-xs font-medium text-muted-foreground">{eyebrow}</p> : null}
        <Progress
          value={progressValue}
          aria-label={`Question ${stepNumber} of ${totalSteps}`}
        />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="flex cursor-pointer items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" /> Previous
            </button>
          ) : (
            <span />
          )}
          <span>
            Question {stepNumber} of {totalSteps}
          </span>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={questionKey}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="space-y-6"
        >
          <h2 className="text-2xl leading-snug font-medium text-balance sm:text-3xl">{prompt}</h2>
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
