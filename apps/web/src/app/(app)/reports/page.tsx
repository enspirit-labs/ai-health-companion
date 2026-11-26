'use client';

import { useMemo, useState } from 'react';
import { ASSESSMENT_LABELS, ASSESSMENT_TYPES, isAssessmentTypeHidden } from '@aidoctor/shared';
import { FileText } from 'lucide-react';

import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { ListItemSkeleton } from '@/components/list-item-skeleton';
import { PageHeader } from '@/components/page-header';
import { ReportList } from '@/components/reports/report-list';
import { ResultCount } from '@/components/result-count';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getReportAssessmentType } from '@/lib/reports/report-assessment-type';
import { useReports } from '@/lib/reports/use-reports';

export default function ReportsPage() {
  const reports = useReports();
  const [assessmentFilter, setAssessmentFilter] = useState<string>('ALL');

  const filtered = useMemo(() => {
    const all = reports.data ?? [];
    if (assessmentFilter === 'ALL') return all;
    return all.filter((report) => getReportAssessmentType(report.title) === assessmentFilter);
  }, [reports.data, assessmentFilter]);

  return (
    <main id="main-content" className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <PageHeader title="Reports" description="Every wellness report generated from your completed assessments." />

      <Select value={assessmentFilter} onValueChange={setAssessmentFilter}>
        <SelectTrigger className="w-48" aria-label="Filter by assessment">
          <SelectValue placeholder="All assessments" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All assessments</SelectItem>
          {ASSESSMENT_TYPES.filter((type) => !isAssessmentTypeHidden(type)).map((type) => (
            <SelectItem key={type} value={type}>
              {ASSESSMENT_LABELS[type]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {reports.isLoading ? (
        <ListItemSkeleton label="Loading reports…" />
      ) : reports.isError ? (
        <ErrorState description="Could not load your reports." onRetry={() => reports.refetch()} />
      ) : (
        <>
          <ResultCount shown={filtered.length} total={(reports.data ?? []).length} />
          <ReportList
            reports={filtered}
            dateStyle="datetime"
            emptyState={
              <EmptyState
                icon={FileText}
                message={
                  (reports.data ?? []).length === 0
                    ? 'No reports yet. These are generated after your first completed assessment.'
                    : 'No reports match this filter.'
                }
              />
            }
          />
        </>
      )}

    </main>
  );
}
