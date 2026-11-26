import { render, screen } from '@testing-library/react';

import { useFeatureFlags } from '@/lib/feature-flags/use-feature-flags';
import { UpcomingAssessmentsGrid } from './upcoming-assessments-grid';

jest.mock('@/lib/feature-flags/use-feature-flags', () => ({ useFeatureFlags: jest.fn() }));

const mockUseFeatureFlags = useFeatureFlags as jest.Mock;
const FLAGS_OFF = { dailyPulse: true, slackReminders: false, assessmentVoice: false, assessmentTongue: false };

describe('UpcomingAssessmentsGrid', () => {
  it('hides Voice and Tongue while their flags are off', () => {
    mockUseFeatureFlags.mockReturnValue({ data: FLAGS_OFF });
    render(<UpcomingAssessmentsGrid types={['VOICE', 'TONGUE', 'SKIN']} />);

    const links = screen.getAllByRole('link', { name: /start/i });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/assessments/skin');
  });

  it('hides Voice and Tongue while the flags are still loading (fail closed)', () => {
    mockUseFeatureFlags.mockReturnValue({ data: undefined, isLoading: true });
    render(<UpcomingAssessmentsGrid types={['VOICE', 'TONGUE']} />);

    expect(screen.queryByRole('link')).toBeNull();
  });

  it('shows a gated type once its flag is on', () => {
    mockUseFeatureFlags.mockReturnValue({ data: { ...FLAGS_OFF, assessmentVoice: true } });
    render(<UpcomingAssessmentsGrid types={['VOICE', 'TONGUE']} />);

    const links = screen.getAllByRole('link', { name: /start/i });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/assessments/voice');
  });
});
