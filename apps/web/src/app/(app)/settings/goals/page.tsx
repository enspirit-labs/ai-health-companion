'use client';

import { useState } from 'react';
import { Target } from 'lucide-react';
import {
  MAX_ACTIVE_GOALS,
  PERSONAL_GOALS,
  PERSONAL_GOAL_DESCRIPTIONS,
  PERSONAL_GOAL_LABELS,
  type PersonalGoal,
} from '@aidoctor/shared';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { useGoals, useSetGoals } from '@/lib/goals/use-goals';
import { cn } from '@/lib/utils';

// Goal wording needs clinician review.
export default function GoalsSettingsPage() {
  const goals = useGoals();
  const setGoals = useSetGoals();
  // null = untouched, show what is saved.
  const [draft, setDraft] = useState<PersonalGoal[] | null>(null);

  const saved = goals.data?.goals ?? [];
  const selected = draft ?? saved;
  const atLimit = selected.length >= MAX_ACTIVE_GOALS;
  const dirty = draft !== null && (draft.length !== saved.length || draft.some((g) => !saved.includes(g)));

  function toggle(goal: PersonalGoal) {
    setDraft(selected.includes(goal) ? selected.filter((g) => g !== goal) : [...selected, goal]);
  }

  return (
    <main id="main-content" className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6">
      <PageHeader
        title="My goals"
        icon={Target}
        backHref="/dashboard"
        description={`Pick one or two things you'd like to focus on. You can change them any time.`}
      />

      {goals.isLoading ? (
        <LoadingState label="Loading your goals…" />
      ) : goals.isError ? (
        <ErrorState description="Could not load your goals." onRetry={() => goals.refetch()} />
      ) : (
        <>
          <ul className="flex flex-col gap-3" aria-label="Goals">
            {PERSONAL_GOALS.map((goal) => {
              const checked = selected.includes(goal);
              const disabled = !checked && atLimit;
              return (
                <li key={goal}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    disabled={disabled}
                    onClick={() => toggle(goal)}
                    className={cn(
                      'flex w-full cursor-pointer flex-col items-start rounded-xl border bg-card p-4 text-left outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
                      checked && 'border-primary bg-primary/5',
                    )}
                  >
                    <span className="text-sm font-medium">{PERSONAL_GOAL_LABELS[goal]}</span>
                    <span className="text-sm text-muted-foreground">{PERSONAL_GOAL_DESCRIPTIONS[goal]}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <p className="text-xs text-muted-foreground">
            {selected.length} of {MAX_ACTIVE_GOALS} chosen
          </p>

          {setGoals.isError ? <Alert variant="error">We couldn&apos;t save your goals. Please try again.</Alert> : null}
          {setGoals.isSuccess && !dirty ? <Alert variant="success">Your goals are saved.</Alert> : null}

          <Button
            type="button"
            disabled={!dirty || selected.length === 0 || setGoals.isPending}
            onClick={() => setGoals.mutate(selected, { onSuccess: () => setDraft(null) })}
          >
            {setGoals.isPending ? 'Saving…' : 'Save goals'}
          </Button>
        </>
      )}
    </main>
  );
}
