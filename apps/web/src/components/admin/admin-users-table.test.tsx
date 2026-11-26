import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AdminUserDto } from '@aidoctor/shared';

import { useUpdateAdminUser } from '@/lib/admin/use-admin';
import { AdminUsersTable } from './admin-users-table';

jest.mock('@/lib/admin/use-admin', () => ({
  useUpdateAdminUser: jest.fn(),
}));

const mockUseUpdateAdminUser = useUpdateAdminUser as jest.Mock;

function makeUser(overrides: Partial<AdminUserDto> = {}): AdminUserDto {
  return {
    id: 'u1',
    email: 'ada@example.com',
    fullName: 'Ada Lovelace',
    role: 'USER',
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    completedAssessmentCount: 3,
    ...overrides,
  };
}

describe('AdminUsersTable', () => {
  const mutate = jest.fn();

  beforeEach(() => {
    mutate.mockClear();
    mockUseUpdateAdminUser.mockReturnValue({ mutate, isPending: false, variables: undefined });
  });

  it('renders an accessible table with a caption', () => {
    render(<AdminUsersTable users={[makeUser()]} currentUserId="someone-else" />);
    expect(screen.getByRole('table')).toHaveAccessibleName(/user management/i);
  });

  it('gives every column header scope="col" and the name cell scope="row"', () => {
    render(<AdminUsersTable users={[makeUser()]} currentUserId="someone-else" />);
    for (const header of screen.getAllByRole('columnheader')) {
      expect(header).toHaveAttribute('scope', 'col');
    }
    expect(screen.getByRole('rowheader', { name: 'Ada Lovelace' })).toBeInTheDocument();
  });

  it('gives the role select an accessible name per row', () => {
    render(<AdminUsersTable users={[makeUser()]} currentUserId="someone-else" />);
    expect(screen.getByRole('combobox', { name: /role for ada lovelace/i })).toBeInTheDocument();
  });

  it('hides action controls for the current user\'s own row', () => {
    render(<AdminUsersTable users={[makeUser({ id: 'me' })]} currentUserId="me" />);
    expect(screen.queryByRole('button', { name: /deactivate/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /reactivate/i })).toBeNull();
  });

  it('confirms before deactivating an active user', async () => {
    const user = userEvent.setup();
    render(<AdminUsersTable users={[makeUser({ isActive: true })]} currentUserId="someone-else" />);

    await user.click(screen.getByRole('button', { name: 'Deactivate Ada Lovelace' }));
    expect(mutate).not.toHaveBeenCalled();

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveAccessibleName(/deactivate ada lovelace/i);
    await user.click(screen.getByRole('button', { name: 'Deactivate' }));

    expect(mutate).toHaveBeenCalledWith({ userId: 'u1', input: { isActive: false } });
  });

  it('reactivates an inactive user without a confirm dialog', async () => {
    const user = userEvent.setup();
    render(<AdminUsersTable users={[makeUser({ isActive: false })]} currentUserId="someone-else" />);

    await user.click(screen.getByRole('button', { name: 'Reactivate Ada Lovelace' }));
    expect(mutate).toHaveBeenCalledWith({ userId: 'u1', input: { isActive: true } });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('shows an empty state when there are no users', () => {
    render(<AdminUsersTable users={[]} currentUserId="someone-else" />);
    expect(screen.getByText('No users yet.')).toBeInTheDocument();
  });
});
