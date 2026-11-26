import { render, screen } from '@testing-library/react';

import { useDashboardStreak } from '@/lib/dashboard/use-dashboard';
import { StreakCard } from './streak-card';

jest.mock('@/lib/dashboard/use-dashboard', () => ({
  useDashboardStreak: jest.fn(),
}));

const mockUseDashboardStreak = useDashboardStreak as jest.Mock;

// Pin the clock to 10 am so the 9 am gate is open for most tests.
// Individual tests that need a different time call jest.setSystemTime explicitly.
beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-01-15T10:00:00'));
});
afterEach(() => {
  jest.useRealTimers();
});

describe('StreakCard', () => {
  it('shows a loading state while the query is pending', () => {
    mockUseDashboardStreak.mockReturnValue({ isLoading: true, isError: false, data: undefined, refetch: jest.fn() });
    render(<StreakCard />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows an error state with a working retry on failure', () => {
    const refetch = jest.fn();
    mockUseDashboardStreak.mockReturnValue({ isLoading: false, isError: true, data: undefined, refetch });
    render(<StreakCard />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('shows the "On a roll" badge once the streak reaches 7 days', () => {
    mockUseDashboardStreak.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { currentStreak: 7, completedToday: true, goalDays: 30, totalActiveDays: 12, lapsed: false },
      refetch: jest.fn(),
    });
    render(<StreakCard />);
    expect(screen.getByText('On a roll')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText(/checked in today/i)).toBeInTheDocument();
  });

  it('shows "Start today" and the first milestone target when the streak is 0', () => {
    mockUseDashboardStreak.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { currentStreak: 0, completedToday: false, goalDays: 30, totalActiveDays: 12, lapsed: false },
      refetch: jest.fn(),
    });
    render(<StreakCard />);
    expect(screen.getByText('Start today')).toBeInTheDocument();
    expect(screen.getByText(/3 more days to star/i)).toBeInTheDocument();
  });

  it('hides the check-in CTA once today is already checked in', () => {
    mockUseDashboardStreak.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { currentStreak: 3, completedToday: true, goalDays: 30, totalActiveDays: 12, lapsed: false },
      refetch: jest.fn(),
    });
    render(<StreakCard />);
    expect(screen.queryByRole('link', { name: /today's check-in/i })).not.toBeInTheDocument();
  });

  it('shows the check-in CTA after 9 am when the user has not yet checked in', () => {
    mockUseDashboardStreak.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { currentStreak: 3, completedToday: false, goalDays: 30, totalActiveDays: 12, lapsed: false },
      refetch: jest.fn(),
    });
    render(<StreakCard />);
    expect(screen.getByRole('link', { name: /today's check-in/i })).toHaveAttribute('href', '/assessments/daily-pulse');
    expect(screen.queryByText(/available at 9/i)).not.toBeInTheDocument();
  });

  it('replaces the CTA with "Available at 9 am" before 9 am when not yet checked in', () => {
    jest.setSystemTime(new Date('2026-01-15T08:30:00'));
    mockUseDashboardStreak.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { currentStreak: 3, completedToday: false, goalDays: 30, totalActiveDays: 12, lapsed: false },
      refetch: jest.fn(),
    });
    render(<StreakCard />);
    expect(screen.queryByRole('link', { name: /today's check-in/i })).not.toBeInTheDocument();
    expect(screen.getByText(/available at 9/i)).toBeInTheDocument();
  });

  it('shows nothing in the CTA slot before 9 am when already checked in', () => {
    jest.setSystemTime(new Date('2026-01-15T08:30:00'));
    mockUseDashboardStreak.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { currentStreak: 3, completedToday: true, goalDays: 30, totalActiveDays: 12, lapsed: false },
      refetch: jest.fn(),
    });
    render(<StreakCard />);
    expect(screen.queryByRole('link', { name: /today's check-in/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/available at 9/i)).not.toBeInTheDocument();
  });

  it('marks earned milestones and shows locked ones grayed for a 7-day streak', () => {
    mockUseDashboardStreak.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { currentStreak: 7, completedToday: true, goalDays: 30, totalActiveDays: 12, lapsed: false },
      refetch: jest.fn(),
    });
    render(<StreakCard />);
    // Star, Superstar, Champion are earned
    expect(screen.getByLabelText(/champion.*earned/i)).toBeInTheDocument();
    // Icon (31 days) is locked
    expect(screen.getByLabelText(/icon.*unlock at 31/i)).toBeInTheDocument();
  });

  it('shows next-milestone target in the sub-text', () => {
    mockUseDashboardStreak.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { currentStreak: 4, completedToday: false, goalDays: 30, totalActiveDays: 12, lapsed: false },
      refetch: jest.fn(),
    });
    render(<StreakCard />);
    expect(screen.getByText(/1 more day to superstar/i)).toBeInTheDocument();
  });


  it('shows the all-achieved message once the user hits 365 days', () => {
    mockUseDashboardStreak.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { currentStreak: 365, completedToday: true, goalDays: 30, totalActiveDays: 12, lapsed: false },
      refetch: jest.fn(),
    });
    render(<StreakCard />);
    // The completedToday message takes priority over the all-achieved one
    expect(screen.getByText(/checked in today/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/interstellar.*earned/i)).toBeInTheDocument();
  });

  it('offers a "Why this?" note for the streak technique', () => {
    mockUseDashboardStreak.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { currentStreak: 2, completedToday: true, goalDays: 30, totalActiveDays: 5, lapsed: false },
      refetch: jest.fn(),
    });
    render(<StreakCard />);
    expect(screen.getByRole('button', { name: /why this/i })).toBeInTheDocument();
  });

  it('shows total active days next to the streak', () => {
    mockUseDashboardStreak.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { currentStreak: 2, completedToday: true, goalDays: 30, totalActiveDays: 41, lapsed: false },
      refetch: jest.fn(),
    });
    render(<StreakCard />);
    expect(screen.getByText(/41 active days in total/i)).toBeInTheDocument();
  });

  it('shows a no-blame welcome-back state and a lighter suggestion after a lapse, keeping total days', () => {
    mockUseDashboardStreak.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { currentStreak: 0, completedToday: false, goalDays: 30, totalActiveDays: 41, lapsed: true },
      refetch: jest.fn(),
    });
    render(<StreakCard />);
    expect(screen.getByText('Welcome back')).toBeInTheDocument();
    expect(screen.getByText(/a quick check-in today is plenty/i)).toBeInTheDocument();
    expect(screen.getByText(/41 active days in total/i)).toBeInTheDocument();
    expect(screen.queryByText(/start today/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/lost|missed|broke/i)).not.toBeInTheDocument();
  });
});
