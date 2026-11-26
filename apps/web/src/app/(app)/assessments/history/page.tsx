'use client';

import { Card, CardContent } from '@/components/ui/card';
import { AssessmentHistoryList } from '@/components/dashboard/assessment-history-list';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { useAssessmentHistory } from '@/lib/dashboard/use-dashboard';

export default function AssessmentHistoryPage() {
  const history = useAssessmentHistory();

  return (
    <main id="main-content" className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <PageHeader title="Assessment history" />

      <Card>
        <CardContent className="py-4">
          {history.isLoading ? (
            <LoadingState label="Loading assessment history…" />
          ) : history.isError ? (
            <ErrorState description="Could not load your assessment history." onRetry={() => history.refetch()} />
          ) : (
            <AssessmentHistoryList items={history.data ?? []} />
          )}
        </CardContent>
      </Card>

    </main>
  );
}
