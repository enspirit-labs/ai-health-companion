import type { ReactNode } from 'react';
import type { RecentReportItem } from '@aidoctor/shared';

import { ReportListItem } from '@/components/reports/report-list-item';

type ReportListData = Pick<RecentReportItem, 'id' | 'title' | 'status' | 'createdAt'>;

export function ReportList({
  reports,
  dateStyle = 'date',
  emptyState,
}: {
  reports: ReportListData[];
  dateStyle?: 'date' | 'datetime';
  /** Rendered when `reports` is empty, e.g. an <EmptyState/> — kept caller-supplied so each surface owns its own copy. */
  emptyState: ReactNode;
}) {
  if (reports.length === 0) {
    return <>{emptyState}</>;
  }

  return (
    // `space-y-3` matches `RecommendationsFeed`'s bordered-card list rhythm — the two
    // adjacent nav tabs now share one visual language (Important).
    <ul className="space-y-3">
      {reports.map((report) => (
        <ReportListItem key={report.id} report={report} dateStyle={dateStyle} />
      ))}
    </ul>
  );
}
