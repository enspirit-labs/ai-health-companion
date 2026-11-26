import { render, screen } from '@testing-library/react';

import { useCurrentUser, useLogout } from '@/lib/auth/use-auth';
import { useFeatureFlags } from '@/lib/feature-flags/use-feature-flags';
import {
  useAssessmentHistory,
  useDashboardRecommendations,
  useDashboardStreak,
  useDashboardSummary,
  useDashboardTrends,
  useRecentReports,
  useRecommendedAssessment,
  useUpcomingAssessments,
} from '@/lib/dashboard/use-dashboard';
import DashboardPage from './page';

const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
}));
jest.mock('@/lib/auth/use-auth', () => ({
  useCurrentUser: jest.fn(),
  useLogout: jest.fn(),
}));
const mockWeeklyActionsCard = jest.fn((_props: { lapsed?: boolean }) => null);
jest.mock('@/components/weekly-actions-card', () => ({
  WeeklyActionsCard: (props: { lapsed?: boolean }) => mockWeeklyActionsCard(props),
}));
jest.mock('@/lib/feature-flags/use-feature-flags', () => ({
  useFeatureFlags: jest.fn(),
}));
jest.mock('@/lib/dashboard/use-dashboard', () => ({
  useAssessmentHistory: jest.fn(),
  useDashboardRecommendations: jest.fn(),
  useDashboardStreak: jest.fn(),
  useDashboardSummary: jest.fn(),
  useDashboardTrends: jest.fn(),
  useRecentReports: jest.fn(),
  useRecommendedAssessment: jest.fn(),
  useUpcomingAssessments: jest.fn(),
}));

const PENDING_QUERY = { isLoading: true, isError: false, data: undefined, refetch: jest.fn() };
const ERROR_QUERY = { isLoading: false, isError: true, data: undefined, refetch: jest.fn() };
const emptySuccess = (data: unknown) => ({ isLoading: false, isError: false, data, refetch: jest.fn() });

function mockAllQueries(query: typeof PENDING_QUERY | typeof ERROR_QUERY | ReturnType<typeof emptySuccess>) {
  (useDashboardSummary as jest.Mock).mockReturnValue(query);
  (useDashboardTrends as jest.Mock).mockReturnValue(query);
  (useAssessmentHistory as jest.Mock).mockReturnValue(query);
  (useUpcomingAssessments as jest.Mock).mockReturnValue(query);
  (useRecentReports as jest.Mock).mockReturnValue(query);
  (useDashboardRecommendations as jest.Mock).mockReturnValue(query);
  (useDashboardStreak as jest.Mock).mockReturnValue(query);
  (useRecommendedAssessment as jest.Mock).mockReturnValue(query);
}

describe('DashboardPage', () => {
  beforeEach(() => {
    (useCurrentUser as jest.Mock).mockReturnValue({ data: { fullName: 'Ada Lovelace', hasHealthProfile: true, role: 'USER' } });
    (useLogout as jest.Mock).mockReturnValue({ mutateAsync: jest.fn() });
    (useFeatureFlags as jest.Mock).mockReturnValue({ data: { dailyPulse: true, slackReminders: false } });
  });

  it('shows loading skeletons/spinners while every query is pending', () => {
    mockAllQueries(PENDING_QUERY);
    render(<DashboardPage />);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });

  it('shows error states when queries fail', () => {
    mockAllQueries(ERROR_QUERY);
    render(<DashboardPage />);
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  });

  it('shows empty copy when queries succeed with no data', () => {
    mockAllQueries(emptySuccess([]));
    (useDashboardSummary as jest.Mock).mockReturnValue(emptySuccess({ hasData: false, dimensions: [] }));
    render(<DashboardPage />);
    expect(screen.getByText(/complete an assessment to see your score/i)).toBeInTheDocument();
  });

  it('shows a tile for every completed assessment and says what the overall score is based on', () => {
    mockAllQueries(emptySuccess([]));
    (useDashboardSummary as jest.Mock).mockReturnValue(
      emptySuccess({
        hasData: true,
        overallScore: 63.8,
        riskLevel: 'MODERATE',
        includedTypes: ['FACE', 'EYE', 'MEMORY'],
        generatedAt: '2026-11-19T04:40:00.000Z',
        dimensions: [
          { key: 'face', label: 'Face', score: 72 },
          { key: 'eye', label: 'Eye', score: 82 },
          { key: 'memory', label: 'Memory', score: 28 },
          { key: 'mentalWellness', label: 'Stress & Mental Wellness', score: null },
          { key: 'hair', label: 'Hair', score: null },
        ],
      }),
    );
    render(<DashboardPage />);

    expect(screen.getByRole('link', { name: 'Face' })).toHaveAttribute('href', '/assessments/history');
    expect(screen.getByRole('link', { name: 'Eye' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Memory' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Stress & Mental Wellness' })).toHaveAttribute(
      'href',
      '/assessments/mental-wellness',
    );
    // Empty, and its only source (HAIR) is hidden from the picker.
    expect(screen.queryByRole('link', { name: 'Hair' })).not.toBeInTheDocument();
    expect(screen.getByText(/based on your latest 3 assessments/i)).toBeInTheDocument();
  });

  it('leaves out empty tiles for assessments that are hidden or switched off', () => {
    mockAllQueries(emptySuccess([]));
    (useDashboardSummary as jest.Mock).mockReturnValue(
      emptySuccess({
        hasData: true,
        overallScore: 80,
        riskLevel: 'LOW',
        includedTypes: ['LIFESTYLE'],
        generatedAt: '2026-11-19T04:40:00.000Z',
        dimensions: [
          { key: 'skin', label: 'Skin', score: null },
          { key: 'hair', label: 'Hair', score: null },
          { key: 'tongue', label: 'Tongue', score: null },
          { key: 'lifestyle', label: 'Lifestyle', score: 80 },
        ],
      }),
    );
    render(<DashboardPage />);
    expect(screen.getByRole('link', { name: 'Skin' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lifestyle' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Hair' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Tongue' })).not.toBeInTheDocument();
  });

  it('shows a Squats tile with its own score and no combined Activity tile', () => {
    mockAllQueries(emptySuccess([]));
    (useDashboardSummary as jest.Mock).mockReturnValue(
      emptySuccess({
        hasData: true,
        overallScore: 70,
        riskLevel: 'MODERATE',
        includedTypes: ['SQUATS'],
        generatedAt: '2026-11-19T04:40:00.000Z',
        dimensions: [
          { key: 'squats', label: 'Squats', score: 70 },
          { key: 'handCoordination', label: 'Hand Coordination', score: null },
          { key: 'walking', label: 'Walking', score: null },
        ],
      }),
    );
    render(<DashboardPage />);

    expect(screen.getByRole('link', { name: 'Squats' })).toHaveTextContent('70');
    expect(screen.getByRole('link', { name: 'Hand Coordination' })).toHaveAttribute(
      'href',
      '/assessments/hand-coordination',
    );
    expect(screen.queryByRole('link', { name: 'Walking' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Activity' })).not.toBeInTheDocument();
    expect(screen.getByText(/based on your latest 1 assessment$/i)).toBeInTheDocument();
  });

  it('greets the user by first name', () => {
    mockAllQueries(emptySuccess([]));
    (useDashboardSummary as jest.Mock).mockReturnValue(emptySuccess({ hasData: false, dimensions: [] }));
    render(<DashboardPage />);
    expect(screen.getByRole('heading', { name: /welcome back, ada/i })).toBeInTheDocument();
  });

  it('renders the Streak Card and recommendation card when daily_pulse is enabled', () => {
    mockAllQueries(emptySuccess([]));
    (useDashboardSummary as jest.Mock).mockReturnValue(emptySuccess({ hasData: false, dimensions: [] }));
    (useDashboardStreak as jest.Mock).mockReturnValue(
      emptySuccess({ currentStreak: 3, completedToday: true, goalDays: 30, totalActiveDays: 12, lapsed: false }),
    );
    (useRecommendedAssessment as jest.Mock).mockReturnValue(emptySuccess({ type: 'SKIN' }));
    render(<DashboardPage />);
    expect(screen.getByText('Daily streak')).toBeInTheDocument();
    expect(screen.getByText('Something new to try')).toBeInTheDocument();
  });

  it('passes the streak lapsed flag to the weekly actions card', () => {
    mockAllQueries(emptySuccess([]));
    (useDashboardStreak as jest.Mock).mockReturnValue(
      emptySuccess({ currentStreak: 0, completedToday: false, goalDays: 30, totalActiveDays: 12, lapsed: true }),
    );
    render(<DashboardPage />);
    expect(mockWeeklyActionsCard).toHaveBeenLastCalledWith({ lapsed: true });
    expect(useDashboardStreak).toHaveBeenCalledWith(true);
  });

  it('hides the Streak Card and recommendation card when daily_pulse is disabled', () => {
    mockAllQueries(emptySuccess([]));
    (useDashboardSummary as jest.Mock).mockReturnValue(emptySuccess({ hasData: false, dimensions: [] }));
    (useFeatureFlags as jest.Mock).mockReturnValue({ data: { dailyPulse: false, slackReminders: false } });
    render(<DashboardPage />);
    expect(screen.queryByText('Daily streak')).not.toBeInTheDocument();
    expect(screen.queryByText('Something new to try')).not.toBeInTheDocument();
    // The streak endpoint 404s while the flag is off, so the page must not request it.
    expect(useDashboardStreak).toHaveBeenLastCalledWith(false);
  });

  it('hides both cards while the feature-flags query is still loading, rather than flashing them on', () => {
    mockAllQueries(emptySuccess([]));
    (useDashboardSummary as jest.Mock).mockReturnValue(emptySuccess({ hasData: false, dimensions: [] }));
    (useFeatureFlags as jest.Mock).mockReturnValue({ data: undefined, isLoading: true });
    render(<DashboardPage />);
    expect(screen.queryByText('Daily streak')).not.toBeInTheDocument();
  });

  // 7035a6d deliberately removed the auto-scroll to the Streak Card: arriving
  // with ?celebrated=true still fires the confetti and strips the query, but the
  // page stays at the top. A bare #dailypulse link is left to the browser's
  // native anchor jump (the card keeps id="dailypulse" and its scroll margin).
  describe('landing via the Daily Pulse completion CTA', () => {
    beforeEach(() => {
      mockReplace.mockClear();
      HTMLElement.prototype.scrollIntoView = jest.fn();
      mockAllQueries(emptySuccess([]));
      (useDashboardSummary as jest.Mock).mockReturnValue(emptySuccess({ hasData: false, dimensions: [] }));
      (useDashboardStreak as jest.Mock).mockReturnValue(
        emptySuccess({ currentStreak: 1, completedToday: true, goalDays: 30, totalActiveDays: 12, lapsed: false }),
      );
      (useRecommendedAssessment as jest.Mock).mockReturnValue(emptySuccess({ type: 'SKIN' }));
    });

    afterEach(() => {
      window.history.replaceState({}, '', '/dashboard');
    });

    it('strips ?celebrated=true from the URL without scrolling to the Streak Card', () => {
      window.history.pushState({}, '', '/dashboard?celebrated=true#dailypulse');

      render(<DashboardPage />);

      expect(mockReplace).toHaveBeenCalledWith('/dashboard');
      expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'start',
      });
    });

    it('leaves a bare #dailypulse link alone: no redirect and no scripted scroll', () => {
      window.history.pushState({}, '', '/dashboard#dailypulse');

      render(<DashboardPage />);

      expect(mockReplace).not.toHaveBeenCalled();
      expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'start',
      });
      expect(screen.getByText('Daily streak')).toBeInTheDocument();
    });
  });
});
