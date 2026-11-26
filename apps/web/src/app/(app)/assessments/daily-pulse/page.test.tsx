import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ClientApiError } from '@/lib/api/client-fetch';
import {
  useAnswerAssessmentQuestion,
  useAssessmentState,
  useCompleteAssessment,
  useStartDailyPulse,
} from '@/lib/assessments/use-assessment';
import { useCurrentUser } from '@/lib/auth/use-auth';
import DailyPulsePage from './page';

jest.mock('@/lib/assessments/use-assessment', () => ({
  useStartDailyPulse: jest.fn(),
  useAssessmentState: jest.fn(),
  useAnswerAssessmentQuestion: jest.fn(),
  useCompleteAssessment: jest.fn(),
}));
jest.mock('@/lib/auth/use-auth', () => ({
  useCurrentUser: jest.fn(),
}));

const routerReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace, push: jest.fn() }),
}));

const mockUseStartDailyPulse = useStartDailyPulse as jest.Mock;
const mockUseAssessmentState = useAssessmentState as jest.Mock;
const mockUseAnswerAssessmentQuestion = useAnswerAssessmentQuestion as jest.Mock;
const mockUseCompleteAssessment = useCompleteAssessment as jest.Mock;
const mockUseCurrentUser = useCurrentUser as jest.Mock;

const FIVE_QUESTIONS = [
  { key: 'moodRating', prompt: 'How is your mood today?', options: null, order: 0, isRequired: true },
  { key: 'stressLevel', prompt: 'How stressed do you feel?', options: null, order: 1, isRequired: true },
  { key: 'sleepQuality', prompt: 'How was your sleep?', options: null, order: 2, isRequired: true },
  { key: 'socialConnection', prompt: 'How connected did you feel?', options: null, order: 3, isRequired: true },
  { key: 'anxietyFrequency', prompt: 'How often did you feel anxious?', options: null, order: 4, isRequired: true },
];

describe('DailyPulsePage', () => {
  beforeEach(() => {
    routerReplace.mockClear();
    mockUseCurrentUser.mockReturnValue({ data: { hasHealthProfile: true } });
    mockUseAnswerAssessmentQuestion.mockReturnValue({ isPending: false, mutate: jest.fn() });
    mockUseCompleteAssessment.mockReturnValue({ isPending: false, data: undefined, mutate: jest.fn(), reset: jest.fn() });
  });

  it('redirects to onboarding instead of starting a check-in when the user has no health profile yet', () => {
    mockUseCurrentUser.mockReturnValue({ data: { hasHealthProfile: false } });
    const mutate = jest.fn();
    mockUseStartDailyPulse.mockReturnValue({ mutate });
    mockUseAssessmentState.mockReturnValue({ data: undefined, isError: false, refetch: jest.fn() });

    render(<DailyPulsePage />);

    expect(routerReplace).toHaveBeenCalledWith('/onboarding/health-profile');
    expect(mutate).not.toHaveBeenCalled();
  });

  it('shows the not-available status when starting a pulse 404s (e.g. the daily_pulse flag is off)', () => {
    mockUseStartDailyPulse.mockReturnValue({
      mutate: (_: undefined, opts: { onError: (e: unknown) => void }) => opts.onError(new ClientApiError(404, 'Not found')),
    });
    mockUseAssessmentState.mockReturnValue({ data: undefined, isError: false, refetch: jest.fn() });

    render(<DailyPulsePage />);

    expect(screen.getByRole('status')).toHaveTextContent(/isn't available yet/i);
  });

  it('shows a loading state before the assessment state has loaded', () => {
    mockUseStartDailyPulse.mockReturnValue({
      mutate: (_: undefined, opts: { onSuccess: (data: { id: string }) => void }) => opts.onSuccess({ id: 'a1' }),
    });
    mockUseAssessmentState.mockReturnValue({ data: undefined, isError: false, refetch: jest.fn() });

    render(<DailyPulsePage />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
  });

  it('shows an error state when the assessment state fails to load', () => {
    mockUseStartDailyPulse.mockReturnValue({
      mutate: (_: undefined, opts: { onSuccess: (data: { id: string }) => void }) => opts.onSuccess({ id: 'a1' }),
    });
    mockUseAssessmentState.mockReturnValue({ data: undefined, isError: true, refetch: jest.fn() });

    render(<DailyPulsePage />);

    expect(screen.getByRole('alert')).toHaveTextContent("Could not load today's check-in.");
  });

  it('renders the 5-question pulse flow with a progress bar once loaded', () => {
    mockUseStartDailyPulse.mockReturnValue({
      mutate: (_: undefined, opts: { onSuccess: (data: { id: string }) => void }) => opts.onSuccess({ id: 'a1' }),
    });
    mockUseAssessmentState.mockReturnValue({
      isError: false,
      refetch: jest.fn(),
      data: {
        inputMode: 'QUESTIONNAIRE',
        questions: FIVE_QUESTIONS,
        answers: {},
        nextQuestion: FIVE_QUESTIONS[0],
        mediaAssets: [],
        testResults: {},
        isReadyToComplete: false,
      },
    });

    render(<DailyPulsePage />);

    expect(screen.getByText('How is your mood today?')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAccessibleName(/question 1 of 5/i);
  });

  it('auto-completes once all questions are answered', async () => {
    const completeMutate = jest.fn();
    mockUseStartDailyPulse.mockReturnValue({
      mutate: (_: undefined, opts: { onSuccess: (data: { id: string }) => void }) => opts.onSuccess({ id: 'a1' }),
    });
    mockUseAssessmentState.mockReturnValue({
      isError: false,
      refetch: jest.fn(),
      data: {
        inputMode: 'QUESTIONNAIRE',
        questions: FIVE_QUESTIONS,
        answers: { moodRating: 4, stressLevel: 3, sleepQuality: 3, socialConnection: 3, anxietyFrequency: 2 },
        nextQuestion: null,
        mediaAssets: [],
        testResults: {},
        isReadyToComplete: true,
      },
    });
    mockUseCompleteAssessment.mockReturnValue({
      isPending: false,
      isSuccess: false,
      data: undefined,
      mutate: completeMutate,
      reset: jest.fn(),
    });

    render(<DailyPulsePage />);

    await waitFor(() => expect(completeMutate).toHaveBeenCalled());
  });

  it('shows a streak-completed card with a Dashboard CTA once completion succeeds, and navigates on click', async () => {
    mockUseStartDailyPulse.mockReturnValue({
      mutate: (_: undefined, opts: { onSuccess: (data: { id: string }) => void }) => opts.onSuccess({ id: 'a1' }),
    });
    mockUseAssessmentState.mockReturnValue({
      isError: false,
      refetch: jest.fn(),
      data: {
        inputMode: 'QUESTIONNAIRE',
        questions: FIVE_QUESTIONS,
        answers: { moodRating: 4, stressLevel: 3, sleepQuality: 3, socialConnection: 3, anxietyFrequency: 2 },
        nextQuestion: null,
        mediaAssets: [],
        testResults: {},
        isReadyToComplete: true,
      },
    });
    mockUseCompleteAssessment.mockReturnValue({
      isPending: false,
      isSuccess: true,
      data: { id: 'result-1' },
      mutate: jest.fn(),
      reset: jest.fn(),
    });

    render(<DailyPulsePage />);

    expect(screen.getByText(/daily streak completed/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /go to dashboard/i }));

    expect(routerReplace).toHaveBeenCalledWith('/dashboard?celebrated=true#dailypulse');
  });
});
