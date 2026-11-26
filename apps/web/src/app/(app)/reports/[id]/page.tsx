'use client';

import { Fragment, use } from 'react';
import { Download } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { ObservationsList } from '@/components/reports/observations-list';
import { RecommendationsCard } from '@/components/reports/recommendations-card';
import { RiskLevelBadge } from '@/components/risk-level-badge';
import { InlineWellnessDisclaimer } from '@/components/wellness-disclaimer';
import { ASSESSMENT_ICONS } from '@/lib/assessments/assessment-icons';
import { useReport } from '@/lib/reports/use-reports';

export default function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const report = useReport(id);
  // A report is one assessment today, so there's only ever one scored
  // section — this is the one whose score heads the report card.
  const primarySection = report.data?.sections.find((s) => s.score !== null);
  const PrimaryIcon = primarySection?.assessmentType ? ASSESSMENT_ICONS[primarySection.assessmentType] : null;

  return (
    <main id="main-content" className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <PageHeader title="Report" backHref="/reports" backLabel="All Reports" />

      {report.isLoading ? (
        <LoadingState label="Loading report…" />
      ) : report.isError ? (
        <ErrorState description="Could not load this report." onRetry={() => report.refetch()} />
      ) : !report.data ? (
        <ErrorState title="Report not found" description="This report may have been removed." />
      ) : report.data.status !== 'READY' ? (
        <Card>
          <CardHeader className="pb-6">
            <CardTitle>{report.data.title}</CardTitle>
            <CardDescription>
              {report.data.status === 'FAILED'
                ? 'Something went wrong generating this report.'
                : 'This report is still being generated.'}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="flex items-start gap-2.5">
                {PrimaryIcon ? <PrimaryIcon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" /> : null}
                <div className="space-y-1.5">
                  <CardTitle>{report.data.title}</CardTitle>
                  <CardDescription>Generated {new Date(report.data.createdAt).toLocaleString()}</CardDescription>
                </div>
              </div>
              {/* The score is the single most important number in this report —
                  give it top billing next to the title instead of burying it
                  in its own separate section below. */}
              {primarySection?.score != null ? (
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <p className="text-5xl font-semibold tabular-nums">{Math.round(primarySection.score)}</p>
                  {primarySection.riskLevel ? <RiskLevelBadge riskLevel={primarySection.riskLevel} /> : null}
                </div>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-4">
              {report.data.summary ? <p className="text-sm">{report.data.summary}</p> : null}
              <Button asChild variant="outline" size="sm">
                <a href={`/api/reports/${report.data.id}/pdf`} download>
                  <Download className="size-4" /> Download PDF
                </a>
              </Button>
            </CardContent>
          </Card>

          {report.data.sections.map((section) => (
            // Score now lives in the header card above — this loop only
            // covers what's genuinely per-section: observations first,
            // then recommendations.
            <Fragment key={section.id}>
              {section.observations.length > 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Observations</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ObservationsList observations={section.observations} />
                  </CardContent>
                </Card>
              ) : null}

              <RecommendationsCard recommendations={section.recommendations} />
            </Fragment>
          ))}
        </>
      )}

      <InlineWellnessDisclaimer className="mt-auto pt-6" />
    </main>
  );
}
