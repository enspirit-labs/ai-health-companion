import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { ReportList } from './report-list';

const READY_REPORT = { id: 'r1', title: 'Wellness report — week 1', status: 'READY' as const, createdAt: '2026-01-01T00:00:00.000Z' };
const GENERATING_REPORT = { id: 'r2', title: 'Wellness report — week 2', status: 'GENERATING' as const, createdAt: '2026-01-08T00:00:00.000Z' };
const FAILED_REPORT = { id: 'r3', title: 'Wellness report — week 3', status: 'FAILED' as const, createdAt: '2026-01-15T00:00:00.000Z' };

describe('ReportList', () => {
  it('renders the emptyState when there are no reports', () => {
    render(<ReportList reports={[]} emptyState={<p>No reports yet.</p>} />);
    expect(screen.getByText('No reports yet.')).toBeInTheDocument();
  });

  it('links READY reports to their detail page', () => {
    render(<ReportList reports={[READY_REPORT]} emptyState={null} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/reports/r1');
    expect(screen.getByText('Ready')).toBeInTheDocument();
  });

  it('does not link GENERATING or FAILED reports', () => {
    render(<ReportList reports={[GENERATING_REPORT, FAILED_REPORT]} emptyState={null} />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Generating')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = render(<ReportList reports={[READY_REPORT, GENERATING_REPORT]} emptyState={null} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
