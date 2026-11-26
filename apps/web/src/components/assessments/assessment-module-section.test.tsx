import { render, screen } from '@testing-library/react';
import type { AssessmentModule } from '@aidoctor/shared';

import { useFeatureFlags } from '@/lib/feature-flags/use-feature-flags';
import { AssessmentModuleSection } from './assessment-module-section';

jest.mock('@/lib/feature-flags/use-feature-flags', () => ({ useFeatureFlags: jest.fn() }));

const mockUseFeatureFlags = useFeatureFlags as jest.Mock;
const FLAGS_OFF = { dailyPulse: true, slackReminders: false, assessmentVoice: false, assessmentTongue: false };

const visualModule: AssessmentModule = {
  id: 'VISUAL',
  label: 'Visual',
  description: 'Camera-based checks',
  types: ['FACE', 'TONGUE'],
};

const vocalModule: AssessmentModule = {
  id: 'VOCAL',
  label: 'Vocal',
  description: 'Voice checks',
  types: ['VOICE'],
};

describe('AssessmentModuleSection', () => {
  it('leaves Tongue out of its module while the flag is off', () => {
    mockUseFeatureFlags.mockReturnValue({ data: FLAGS_OFF });
    render(<AssessmentModuleSection module={visualModule} isCompleted={() => false} />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/assessments/face');
  });

  it('drops a module entirely when its only type is switched off', () => {
    mockUseFeatureFlags.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = render(<AssessmentModuleSection module={vocalModule} isCompleted={() => false} />);

    expect(screen.queryByRole('heading', { name: 'Vocal' })).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it('lists a gated type once its flag is on', () => {
    mockUseFeatureFlags.mockReturnValue({ data: { ...FLAGS_OFF, assessmentVoice: true } });
    render(<AssessmentModuleSection module={vocalModule} isCompleted={() => false} />);

    expect(screen.getByRole('heading', { name: 'Vocal' })).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/assessments/voice');
  });
});
