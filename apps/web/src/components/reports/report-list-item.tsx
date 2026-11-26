import Link from 'next/link';
import { FileText } from 'lucide-react';
import type { RecentReportItem } from '@aidoctor/shared';

import { Badge } from '@/components/ui/badge';
import { ASSESSMENT_ICONS } from '@/lib/assessments/assessment-icons';
import { getReportAssessmentType } from '@/lib/reports/report-assessment-type';
import { cn } from '@/lib/utils';

const REPORT_STATUS_CONFIG: Record<RecentReportItem['status'], { variant: 'good' | 'critical' | 'outline'; label: string }> = {
  READY: { variant: 'good', label: 'Ready' },
  FAILED: { variant: 'critical', label: 'Failed' },
  GENERATING: { variant: 'outline', label: 'Generating' },
};

type ReportListItemData = Pick<RecentReportItem, 'id' | 'title' | 'status' | 'createdAt'>;

export function ReportListItem({
  report,
  dateStyle = 'date',
}: {
  report: ReportListItemData;
  /** Dashboard widget shows date-only; the full reports page shows date + time. */
  dateStyle?: 'date' | 'datetime';
}) {
  const { variant, label } = REPORT_STATUS_CONFIG[report.status];
  const formattedDate =
    dateStyle === 'datetime'
      ? // Dropped to hour:minute — `toLocaleString()`'s default precision (down to
        // the second) was needlessly precise for a report list.
        new Date(report.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
      : new Date(report.createdAt).toLocaleDateString();

  // GENERATING/FAILED rows aren't navigable — mark them inert for sighted
  // users via muted text so they don't look identical to a clickable READY
  // row (Critical). The actual screen-reader affordance is the
  // Badge status text ("Generating"/"Failed") already in reading order below;
  // a bare `<div>` has ARIA role `generic`, which doesn't support the
  // `aria-disabled` state, so the attribute here is kept only as a
  // styling/test hook, not as something assistive tech reacts to.
  const isInert = report.status !== 'READY';
  const assessmentType = getReportAssessmentType(report.title);
  const Icon = assessmentType ? ASSESSMENT_ICONS[assessmentType] : FileText;

  const content = (
    <>
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm font-medium', isInert && 'text-muted-foreground')}>{report.title}</p>
        <p className="text-xs text-muted-foreground">{formattedDate}</p>
      </div>
      <Badge variant={variant}>{label}</Badge>
    </>
  );

  return (
    <li>
      {report.status === 'READY' ? (
        <Link
          href={`/reports/${report.id}`}
          className="flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent/50"
        >
          {content}
        </Link>
      ) : (
        <div aria-disabled="true" className="flex items-center gap-3 rounded-lg border p-4 opacity-60">
          {content}
        </div>
      )}
    </li>
  );
}
