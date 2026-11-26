'use client';

import Link from 'next/link';
import { CalendarCheck } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { useToggleWeeklyAction, useWeeklyActions } from '@/lib/goals/use-weekly-actions';

/**
 * This week's small actions for the user's chosen goals. `lapsed` is the
 * welcome-back signal: when true the card shows the lighter set.
 * Wording needs clinician review.
 */
export function WeeklyActionsCard({ lapsed = false }: { lapsed?: boolean }) {
  const week = useWeeklyActions(lapsed);
  const toggle = useToggleWeeklyAction();
  const actions = week.data?.actions ?? [];
  const doneCount = actions.filter((a) => a.completed).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          <CalendarCheck className="size-5" aria-hidden="true" />
        </div>
        <div className="space-y-0.5">
          <CardTitle className="text-base">This week</CardTitle>
          <CardDescription>
            {week.data?.lighter
              ? 'A lighter week. Just a couple of small things.'
              : 'Three small things for your goal. Tick them off as you go.'}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {week.isLoading ? (
          <LoadingState label="Loading this week's actions…" />
        ) : week.isError ? (
          <ErrorState description="Could not load this week's actions." onRetry={() => week.refetch()} />
        ) : actions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            <Link href="/settings/goals" className="text-primary underline underline-offset-4">
              Pick a goal
            </Link>{' '}
            to get a few small actions each week.
          </p>
        ) : (
          <>
            <ul className="space-y-2" aria-label="Weekly actions">
              {actions.map((action) => (
                <li key={action.id}>
                  <label className="flex cursor-pointer items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={action.completed}
                      disabled={toggle.isPending}
                      onChange={(e) => toggle.mutate({ actionId: action.id, completed: e.target.checked })}
                      className="mt-0.5 size-4"
                    />
                    <span>
                      <span className="font-medium">{action.title}</span>
                      <span className="block text-muted-foreground">{action.detail}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              {doneCount} of {actions.length} done this week
            </p>
            {toggle.isError ? (
              <p role="alert" className="mt-2 text-xs text-destructive">
                We couldn&apos;t save that. Please try again.
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
