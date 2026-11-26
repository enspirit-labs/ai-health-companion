import { ASSESSMENT_LABELS, ASSESSMENT_TYPES } from '@aidoctor/shared';

import { getReportAssessmentType } from './report-assessment-type';

// (Important): report rows/filters need an assessment type derived
// from the title, since RecentReportItem carries no assessmentType field.
describe('getReportAssessmentType', () => {
  it.each([
    ['Face Assessment Report', 'FACE'],
    ['Eye Assessment Report', 'EYE'],
    ['Squats Test Report', 'SQUATS'],
    ['Mental Wellness Questionnaire Report', 'MENTAL_WELLNESS'],
  ])('maps %s to %s', (title, expected) => {
    expect(getReportAssessmentType(title)).toBe(expected);
  });

  it('returns null for a title that does not start with a known assessment label', () => {
    expect(getReportAssessmentType('Daily Pulse — Weekly Summary — 2026-01-01')).toBeNull();
  });

  it('returns null for an empty title', () => {
    expect(getReportAssessmentType('')).toBeNull();
  });

  // (edge-case coverage): the helper's own doc comment calls
  // out the Daily Pulse weekly rollup as the case it must not match — pin the
  // exact prefix the API actually emits for it
  // (`WEEKLY_ROLLUP_TITLE_PREFIX` in apps/api/src/reports/reports.service.ts).
  it('returns null for the weekly rollup prefix with no trailing date', () => {
    expect(getReportAssessmentType('Daily Pulse — Weekly Summary')).toBeNull();
  });

  // A title that only *contains* a label instead of starting with it must not
  // match — the derivation is a prefix check, not a substring search, per
  // `getReportAssessmentType`'s implementation (`title.startsWith(...)`).
  it('returns null when a label appears mid-string instead of as a prefix', () => {
    expect(getReportAssessmentType('Weekly Digest: Face Assessment Report')).toBeNull();
  });

  // A title shorter than any label is a partial/truncated match and must not
  // be treated as a hit.
  it('returns null for a truncated title shorter than any assessment label', () => {
    expect(getReportAssessmentType('Face')).toBeNull();
  });

  // `startsWith` is case-sensitive by design here: the API always emits the
  // exact `ASSESSMENT_LABELS[type]` casing (reports.service.ts), so a
  // differently-cased title is not a real report title this helper needs to
  // handle — document the boundary rather than silently normalizing case.
  it('is case-sensitive and does not match a differently-cased label', () => {
    expect(getReportAssessmentType('face assessment report')).toBeNull();
    expect(getReportAssessmentType('FACE ASSESSMENT REPORT')).toBeNull();
  });

  // The suffix after the label prefix is unconstrained — this documents that
  // the helper matches on prefix alone, not on the full "<Label> Report" shape.
  it('matches on label prefix alone, regardless of what follows it', () => {
    expect(getReportAssessmentType('Face Assessment')).toBe('FACE');
    expect(getReportAssessmentType('Face Assessment Report (draft)')).toBe('FACE');
  });

  // ISS-3: `getReportAssessmentType` resolves ties by `ASSESSMENT_TYPES`
  // declaration order via `Array.prototype.find`, which silently depends on no
  // `ASSESSMENT_LABELS` value being a prefix of another. Assert that
  // invariant over the real imported constants so a future label addition
  // that violates it fails loudly here instead of causing a silent
  // misclassification in `getReportAssessmentType`.
  it('has no assessment label that is a prefix of another (declaration-order tiebreak is unambiguous)', () => {
    for (const a of ASSESSMENT_TYPES) {
      for (const b of ASSESSMENT_TYPES) {
        if (a === b) continue;
        expect(ASSESSMENT_LABELS[a].startsWith(ASSESSMENT_LABELS[b])).toBe(false);
      }
    }
  });
});
