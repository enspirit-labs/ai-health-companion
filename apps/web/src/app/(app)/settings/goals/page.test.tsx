import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useGoals, useSetGoals } from '@/lib/goals/use-goals';
import GoalsSettingsPage from './page';

jest.mock('@/lib/goals/use-goals', () => ({ useGoals: jest.fn(), useSetGoals: jest.fn() }));

const mockUseGoals = useGoals as jest.Mock;
const mockUseSetGoals = useSetGoals as jest.Mock;

describe('GoalsSettingsPage', () => {
  let mutate: jest.Mock;

  beforeEach(() => {
    mutate = jest.fn();
    mockUseSetGoals.mockReturnValue({ isPending: false, isError: false, isSuccess: false, mutate });
    mockUseGoals.mockReturnValue({ isLoading: false, isError: false, data: { goals: ['SLEEP'] } });
  });

  it('shows saved goals as checked', () => {
    render(<GoalsSettingsPage />);
    expect(screen.getByRole('checkbox', { name: /sleep better/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /move more/i })).not.toBeChecked();
  });

  it('disables the other goals once two are chosen', async () => {
    render(<GoalsSettingsPage />);
    await userEvent.click(screen.getByRole('checkbox', { name: /move more/i }));
    expect(screen.getByRole('checkbox', { name: /feel calmer/i })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /move more/i })).toBeEnabled();
  });

  it('saves the changed selection', async () => {
    render(<GoalsSettingsPage />);
    await userEvent.click(screen.getByRole('checkbox', { name: /sleep better/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /feel calmer/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Save goals' }));
    expect(mutate).toHaveBeenCalledWith(['STRESS'], expect.any(Object));
  });

  it('cannot save before anything changes or with no goal chosen', async () => {
    render(<GoalsSettingsPage />);
    expect(screen.getByRole('button', { name: 'Save goals' })).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox', { name: /sleep better/i }));
    expect(screen.getByRole('button', { name: 'Save goals' })).toBeDisabled();
  });

  it('shows an error state when goals fail to load', () => {
    mockUseGoals.mockReturnValue({ isLoading: false, isError: true, data: undefined, refetch: jest.fn() });
    render(<GoalsSettingsPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load your goals.');
  });
});
