import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useCurrentUser } from '@/lib/auth/use-auth';
import { useDeleteAccount, useExportData } from '@/lib/data-rights/use-data-rights';
import YourDataPage from './page';

jest.mock('@/lib/auth/use-auth', () => ({ useCurrentUser: jest.fn() }));
jest.mock('@/lib/data-rights/use-data-rights', () => ({ useDeleteAccount: jest.fn(), useExportData: jest.fn() }));

const mockUseCurrentUser = useCurrentUser as jest.Mock;
const mockUseDeleteAccount = useDeleteAccount as jest.Mock;
const mockUseExportData = useExportData as jest.Mock;

describe('YourDataPage', () => {
  let mutate: jest.Mock;
  let exportMutate: jest.Mock;

  beforeEach(() => {
    mutate = jest.fn();
    exportMutate = jest.fn();
    mockUseExportData.mockReturnValue({ isPending: false, isError: false, mutate: exportMutate });
    mockUseDeleteAccount.mockReturnValue({ isPending: false, isError: false, error: null, mutate, reset: jest.fn() });
    mockUseCurrentUser.mockReturnValue({ isLoading: false, data: { id: 'u1' } });
  });

  it('asks a signed-out visitor to sign in', () => {
    mockUseCurrentUser.mockReturnValue({ isLoading: false, data: null });
    render(<YourDataPage />);
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('button', { name: 'Delete my data' })).toBeNull();
  });

  it('downloads the data when "Download my data" is clicked', async () => {
    render(<YourDataPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Download my data' }));
    expect(exportMutate).toHaveBeenCalled();
  });

  it('shows an error when the download fails', () => {
    mockUseExportData.mockReturnValue({ isPending: false, isError: true, mutate: exportMutate });
    render(<YourDataPage />);
    expect(screen.getByText(/couldn.t prepare your download/i)).toBeInTheDocument();
  });

  it('does not delete on the first click: it opens a confirmation step', async () => {
    render(<YourDataPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete my data' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('keeps the final button disabled until DELETE is typed, then sends it with the password', async () => {
    render(<YourDataPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete my data' }));
    const confirm = screen.getByRole('button', { name: 'Permanently delete' });
    expect(confirm).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/type delete/i), 'delete');
    expect(confirm).toBeDisabled();
    await userEvent.clear(screen.getByLabelText(/type delete/i));
    await userEvent.type(screen.getByLabelText(/type delete/i), 'DELETE');
    await userEvent.type(screen.getByLabelText('Your password'), 'secret');
    expect(confirm).toBeEnabled();

    await userEvent.click(confirm);
    expect(mutate).toHaveBeenCalledWith({ confirmation: 'DELETE', password: 'secret' });
  });

  it('shows the server error inside the dialog', async () => {
    mockUseDeleteAccount.mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error('That password is not correct'),
      mutate,
      reset: jest.fn(),
    });
    render(<YourDataPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete my data' }));
    expect(screen.getByText('That password is not correct')).toBeInTheDocument();
  });
});
