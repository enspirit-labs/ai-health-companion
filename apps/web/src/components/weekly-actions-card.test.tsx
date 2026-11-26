import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useToggleWeeklyAction, useWeeklyActions } from '@/lib/goals/use-weekly-actions';
import { WeeklyActionsCard } from './weekly-actions-card';

jest.mock('@/lib/goals/use-weekly-actions', () => ({
  useWeeklyActions: jest.fn(),
  useToggleWeeklyAction: jest.fn(),
}));

const mockUseWeeklyActions = useWeeklyActions as jest.Mock;
const mockUseToggle = useToggleWeeklyAction as jest.Mock;

const ACTIONS = [
  { id: 'a', goal: 'SLEEP', title: 'Wind down', detail: 'Dim the lights', completed: true, completedAt: '2026-10-27T08:00:00.000Z' },
  { id: 'b', goal: 'SLEEP', title: 'Regular bedtime', detail: 'Same time', completed: false, completedAt: null },
  { id: 'c', goal: 'SLEEP', title: 'Skip caffeine', detail: 'After lunch', completed: false, completedAt: null },
];

describe('WeeklyActionsCard', () => {
  let mutate: jest.Mock;

  beforeEach(() => {
    mutate = jest.fn();
    mockUseToggle.mockReturnValue({ isPending: false, isError: false, mutate });
    mockUseWeeklyActions.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { weekStart: '2026-10-26', lighter: false, actions: ACTIONS },
    });
  });

  it('lists the actions with their ticked state and a progress line', () => {
    render(<WeeklyActionsCard />);
    expect(screen.getByRole('checkbox', { name: /wind down/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /regular bedtime/i })).not.toBeChecked();
    expect(screen.getByText('1 of 3 done this week')).toBeInTheDocument();
  });

  it('ticks and unticks an action', async () => {
    render(<WeeklyActionsCard />);
    await userEvent.click(screen.getByRole('checkbox', { name: /regular bedtime/i }));
    expect(mutate).toHaveBeenCalledWith({ actionId: 'b', completed: true });
    await userEvent.click(screen.getByRole('checkbox', { name: /wind down/i }));
    expect(mutate).toHaveBeenCalledWith({ actionId: 'a', completed: false });
  });

  it('asks for the lighter set when lapsed', () => {
    render(<WeeklyActionsCard lapsed />);
    expect(mockUseWeeklyActions).toHaveBeenCalledWith(true);
  });

  it('describes a lighter week without pressure', () => {
    mockUseWeeklyActions.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { weekStart: '2026-10-26', lighter: true, actions: ACTIONS.slice(0, 2) },
    });
    render(<WeeklyActionsCard lapsed />);
    expect(screen.getByText(/a lighter week/i)).toBeInTheDocument();
  });

  it('points to the goals page when no goal is chosen', () => {
    mockUseWeeklyActions.mockReturnValue({
      isLoading: false,
      isError: false,
      data: { weekStart: '2026-10-26', lighter: false, actions: [] },
    });
    render(<WeeklyActionsCard />);
    expect(screen.getByRole('link', { name: /pick a goal/i })).toHaveAttribute('href', '/settings/goals');
  });

  it('shows a loading state and an error state', () => {
    mockUseWeeklyActions.mockReturnValue({ isLoading: true, isError: false, data: undefined });
    const { unmount } = render(<WeeklyActionsCard />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    unmount();
    mockUseWeeklyActions.mockReturnValue({ isLoading: false, isError: true, data: undefined, refetch: jest.fn() });
    render(<WeeklyActionsCard />);
    expect(screen.getByRole('alert')).toHaveTextContent("Could not load this week's actions.");
  });
});
