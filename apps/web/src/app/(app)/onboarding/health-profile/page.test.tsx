import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useCurrentUser } from '@/lib/auth/use-auth';
import { useAnswerHealthProfileQuestion, useHealthProfile } from '@/lib/health-profile/use-health-profile';
import HealthProfileOnboardingPage from './page';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@/lib/auth/use-auth', () => ({
  useCurrentUser: jest.fn(),
}));
jest.mock('@/lib/health-profile/use-health-profile', () => ({
  useHealthProfile: jest.fn(),
  useAnswerHealthProfileQuestion: jest.fn(),
}));

const mockUseHealthProfile = useHealthProfile as jest.Mock;
const mockUseAnswerHealthProfileQuestion = useAnswerHealthProfileQuestion as jest.Mock;

describe('HealthProfileOnboardingPage', () => {
  beforeEach(() => {
    mockUseAnswerHealthProfileQuestion.mockReturnValue({ isPending: false, mutate: jest.fn() });
    (useCurrentUser as jest.Mock).mockReturnValue({ data: { hasHealthProfile: false, fullName: 'Test User' } });
  });

  it('shows a loading state while the profile is pending', () => {
    mockUseHealthProfile.mockReturnValue({ isLoading: true, isError: false, data: undefined, refetch: jest.fn() });
    render(<HealthProfileOnboardingPage />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
  });

  it('shows an error state when the profile fails to load', () => {
    mockUseHealthProfile.mockReturnValue({ isLoading: false, isError: true, data: undefined, refetch: jest.fn() });
    render(<HealthProfileOnboardingPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load your health profile.');
  });

  it('shows the intro card before the first question of a fresh profile', () => {
    mockUseHealthProfile.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { profile: null, isComplete: false, nextQuestion: 'age' },
      refetch: jest.fn(),
    });
    render(<HealthProfileOnboardingPage />);
    expect(screen.getByText(/let's build your health profile/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Age')).not.toBeInTheDocument();
  });

  it('asks the first question once the intro is dismissed', async () => {
    const user = userEvent.setup();
    mockUseHealthProfile.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { profile: null, isComplete: false, nextQuestion: 'age' },
      refetch: jest.fn(),
    });
    render(<HealthProfileOnboardingPage />);
    await user.click(screen.getByRole('button', { name: "Let's get started" }));
    expect(screen.getByPlaceholderText('Age')).toBeInTheDocument();
  });

  it('skips the intro card when resuming mid-flow', () => {
    mockUseHealthProfile.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { profile: null, isComplete: false, nextQuestion: 'gender' },
      refetch: jest.fn(),
    });
    render(<HealthProfileOnboardingPage />);
    expect(screen.queryByText("Let's build your health profile")).not.toBeInTheDocument();
    expect(screen.getByText('What is your gender?')).toBeInTheDocument();
  });

  it('shows the completion message once done', () => {
    mockUseHealthProfile.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { profile: null, isComplete: true, nextQuestion: null },
      refetch: jest.fn(),
    });
    render(<HealthProfileOnboardingPage />);
    expect(screen.getByRole('status')).toHaveTextContent(/all set/i);
  });
});
