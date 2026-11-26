import { render, screen } from '@testing-library/react';

import { ReportListItem } from './report-list-item';

const READY_REPORT = { id: 'r1', title: 'Face Assessment Report', status: 'READY' as const, createdAt: '2026-01-01T17:14:11.000Z' };
const GENERATING_REPORT = {
  id: 'r2',
  title: 'Eye Assessment Report',
  status: 'GENERATING' as const,
  createdAt: '2026-01-08T00:00:00.000Z',
};
const UNMATCHED_REPORT = {
  id: 'r3',
  title: 'Daily Pulse — Weekly Summary — 2026-01-01',
  status: 'READY' as const,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('ReportListItem', () => {
  // (Critical): non-clickable rows must not look/read identical to a
  // clickable READY row.
  describe('inert (non-READY) rows', () => {
    it('marks a GENERATING row aria-disabled and does not render it as a link', () => {
      render(<ReportListItem report={GENERATING_REPORT} />);
      expect(screen.queryByRole('link')).toBeNull();
      const row = screen.getByText('Eye Assessment Report').closest('[aria-disabled]');
      expect(row).toHaveAttribute('aria-disabled', 'true');
    });

    it('mutes the title text on an inert row', () => {
      render(<ReportListItem report={GENERATING_REPORT} />);
      expect(screen.getByText('Eye Assessment Report')).toHaveClass('text-muted-foreground');
    });

    // (edge-case coverage): the ticket calls out both
    // GENERATING *and* FAILED rows as non-clickable
    // (report-list-item.tsx:47-49 in the audit) — the existing coverage above
    // only exercised GENERATING. Parametrize across every non-READY status so
    // a status-specific regression (e.g. FAILED alone losing aria-disabled)
    // would be caught.
    it.each(['GENERATING', 'FAILED'] as const)(
      'marks a %s row aria-disabled, muted, and not a link',
      (status) => {
        const report = { ...GENERATING_REPORT, status };
        render(<ReportListItem report={report} />);
        expect(screen.queryByRole('link')).toBeNull();
        const row = screen.getByText(report.title).closest('[aria-disabled]');
        expect(row).toHaveAttribute('aria-disabled', 'true');
        expect(screen.getByText(report.title)).toHaveClass('text-muted-foreground');
      },
    );
  });

  describe('READY rows', () => {
    it('renders as a link to the report detail page with no aria-disabled', () => {
      render(<ReportListItem report={READY_REPORT} />);
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', '/reports/r1');
      expect(link).not.toHaveAttribute('aria-disabled');
    });
  });

  // (Important): per-type icon for scannability.
  describe('assessment-type icon', () => {
    // ISS-2: assert the specific lucide-react glyph class rather than "some
    // svg exists" — `FileText` (the fallback) is also an svg, so the old
    // assertion passed identically even if `getReportAssessmentType` always
    // returned null. READY_REPORT's title ("Face Assessment Report") maps to
    // FACE -> ScanFace -> class `lucide-scan-face` via ASSESSMENT_ICONS.
    it('renders an icon for a title matching a known assessment label', () => {
      const { container } = render(<ReportListItem report={READY_REPORT} />);
      expect(container.querySelector('.lucide-scan-face')).toBeInTheDocument();
      expect(container.querySelector('.lucide-file-text')).toBeNull();
    });

    it('falls back to a generic icon for a title with no matching assessment label', () => {
      const { container } = render(<ReportListItem report={UNMATCHED_REPORT} />);
      expect(container.querySelector('.lucide-file-text')).toBeInTheDocument();
      expect(container.querySelector('.lucide-scan-face')).toBeNull();
    });
  });

  // (Important): timestamps were needlessly precise (down to the second).
  describe('timestamp precision', () => {
    // ISS-1: the old assertion was `$`-anchored against the whole anchor's
    // textContent (title + date + trailing Badge label like "Ready"), so it
    // always ended in the badge text and could never match/fail. Assert the
    // formatted timestamp text directly instead. READY_REPORT's createdAt is
    // 2026-01-01T17:14:11.000Z, deterministic under the mandatory TZ=UTC.
    it('renders datetime without seconds', () => {
      render(<ReportListItem report={READY_REPORT} dateStyle="datetime" />);
      expect(screen.getByText('Jan 1, 2026, 5:14 PM')).toBeInTheDocument();
      expect(screen.queryByText(/\d{1,2}:\d{2}:\d{2}/)).toBeNull();
    });
  });
});
