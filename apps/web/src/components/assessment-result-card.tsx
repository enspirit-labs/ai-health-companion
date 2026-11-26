import { Fragment } from 'react';
import { Download, MessageCircleHeart } from 'lucide-react';
import type { AssessmentResult } from '@aidoctor/shared';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ObservationsList } from '@/components/reports/observations-list';
import { RecommendationsCard } from '@/components/reports/recommendations-card';
import { RiskLevelBadge } from '@/components/risk-level-badge';
import { InlineWellnessDisclaimer } from '@/components/wellness-disclaimer';
import { ASSESSMENT_ICONS } from '@/lib/assessments/assessment-icons';
import { useReport } from '@/lib/reports/use-reports';
import {
  ASSESSMENT_LABELS,
  SUPPORT_CARD_EMERGENCY,
  SUPPORT_CARD_MESSAGE,
  SUPPORT_CARD_OPTIONS,
  SUPPORT_CARD_TITLE,
} from '@aidoctor/shared';

/** Fixed copy, never model-written — shown on every result. */
export const RESULT_IS_NOT_A_HEALTH_CHECK = 'This result is a wellness estimate, not a health check.';
/** Fixed signposting for the top wellness-signal band ("Talk to someone").
 * Deliberately names no condition, calls nothing abnormal and quotes no
 * thresholds. */
export const TOP_BAND_SIGNPOST = 'If something here worries you, talking to a healthcare professional may help.';

/**
 * Same visual structure as a saved Report's sections (score, observations,
 * recommendations each get their own card, observations leading) — this is
 * the first place a result is ever shown, right after completing an
 * assessment, and should read the same way a report does rather than drift
 * into its own layout.
 */
export function AssessmentResultCard({ result }: { result: AssessmentResult }) {
  const Icon = ASSESSMENT_ICONS[result.type];
  const report = useReport(result.reportId ?? null);
  const isReportReady = report.data?.status === 'READY';
  const showSupportCard = result.supportCard === true;

  return (
    <Fragment>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 pb-6">
          <div className="flex items-start gap-2.5">
            <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div className="space-y-1.5">
              <CardTitle>{ASSESSMENT_LABELS[result.type]} result</CardTitle>
              <CardDescription>Completed {new Date(result.completedAt).toLocaleString()}</CardDescription>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {/* The support card replaces the score emphasis and the wellness-signal
                badge so a green "On track" never contradicts it. */}
            {showSupportCard ? null : (
              <>
                <p className="text-5xl font-semibold tabular-nums">{Math.round(result.score)}</p>
                <RiskLevelBadge riskLevel={result.riskLevel} />
                <p className="text-xs text-muted-foreground">{result.confidence}% confidence</p>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{RESULT_IS_NOT_A_HEALTH_CHECK}</p>
          {showSupportCard ? <SupportCard /> : null}
          {result.riskLevel === 'HIGH' && !showSupportCard ? (
            <p role="note" className="flex items-start gap-2 rounded-lg bg-muted p-3 text-sm">
              <MessageCircleHeart className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              {TOP_BAND_SIGNPOST}
            </p>
          ) : null}
          {isReportReady ? (
            <>
              {report.data?.summary ? <p className="text-sm">{report.data.summary}</p> : null}
              <Button asChild variant="outline" size="sm">
                <a href={`/api/reports/${result.reportId}/pdf`} download>
                  <Download className="size-4" /> Download PDF
                </a>
              </Button>
            </>
          ) : null}
        </CardContent>
      </Card>

      {result.observations.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Observations</CardTitle>
          </CardHeader>
          <CardContent>
            <ObservationsList observations={result.observations} />
          </CardContent>
        </Card>
      ) : null}

      <RecommendationsCard recommendations={result.recommendations} />

      <InlineWellnessDisclaimer />
    </Fragment>
  );
}

/** Fixed copy from @aidoctor/shared, never model-written; needs clinician review. */
function SupportCard() {
  return (
    <section role="status" aria-label={SUPPORT_CARD_TITLE} className="space-y-3 rounded-lg bg-muted p-4 text-sm">
      <h3 className="flex items-center gap-2 font-medium">
        <MessageCircleHeart className="size-4 shrink-0 text-primary" aria-hidden="true" />
        {SUPPORT_CARD_TITLE}
      </h3>
      <p>{SUPPORT_CARD_MESSAGE}</p>
      <ul className="list-disc space-y-1 pl-5">
        {SUPPORT_CARD_OPTIONS.map((option) => (
          <li key={option}>{option}</li>
        ))}
      </ul>
      <p>{SUPPORT_CARD_EMERGENCY}</p>
    </section>
  );
}
