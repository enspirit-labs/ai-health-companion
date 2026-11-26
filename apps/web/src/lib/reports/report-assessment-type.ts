import { ASSESSMENT_LABELS, ASSESSMENT_TYPES } from '@aidoctor/shared';
import type { AssessmentType } from '@aidoctor/shared';

/**
 * `RecentReportItem` (`packages/shared/src/dashboard.ts`) has no `assessmentType`
 * field — the API only sets `title: `${ASSESSMENT_LABELS[type]} Report`` when it
 * creates a per-assessment report (`apps/api/src/reports/reports.service.ts`).
 * Adding a real field would touch `packages/shared` / the API, which
 * marks out of scope, so the type is derived from the title prefix instead.
 * Reports whose title doesn't start with a known label (e.g. the Daily Pulse
 * weekly rollup, "Daily Pulse — Weekly Summary …") return `null` and are treated
 * as uncategorized everywhere this is used — icon falls back, filter only
 * matches "All".
 */
export function getReportAssessmentType(title: string): AssessmentType | null {
  return ASSESSMENT_TYPES.find((type) => title.startsWith(ASSESSMENT_LABELS[type])) ?? null;
}
