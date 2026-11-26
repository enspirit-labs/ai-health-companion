import { render, screen } from '@testing-library/react';

import { useUpcomingAssessments } from '@/lib/dashboard/use-dashboard';
import AssessmentsHubPage from './page';

jest.mock('@/lib/dashboard/use-dashboard', () => ({ useUpcomingAssessments: jest.fn() }));
// The module sections read feature flags to hide gated assessments.
jest.mock('@/lib/feature-flags/use-feature-flags', () => ({ useFeatureFlags: () => ({ data: undefined }) }));

const mockUseUpcomingAssessments = useUpcomingAssessments as jest.Mock;

describe('AssessmentsHubPage', () => {
  beforeEach(() => {
    mockUseUpcomingAssessments.mockReturnValue({ data: [] });
  });

  it('lists real assessments', () => {
    render(<AssessmentsHubPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Assessments' })).toBeInTheDocument();
    expect(screen.getAllByRole('link').length).toBeGreaterThan(0);
  });

  it('does not link to the removed simulated vitals preview', () => {
    render(<AssessmentsHubPage />);

    expect(screen.queryByRole('link', { name: /vitals scan/i })).toBeNull();
    for (const link of screen.getAllByRole('link')) {
      expect(link).not.toHaveAttribute('href', expect.stringContaining('vitals'));
    }
  });
});
