import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { useLogin } from '@/lib/auth/use-auth';
import { hardNavigate } from '@/lib/navigation';
import LoginPage from './page';

let searchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({ useSearchParams: () => searchParams }));
jest.mock('@/lib/auth/use-auth', () => ({ useLogin: jest.fn() }));
jest.mock('@/lib/navigation', () => ({
  ...jest.requireActual('@/lib/navigation'),
  hardNavigate: jest.fn(),
}));

const useLoginMock = useLogin as jest.Mock;
const hardNavigateMock = hardNavigate as jest.MockedFunction<typeof hardNavigate>;

async function signIn() {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'b@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('LoginPage', () => {
  beforeEach(() => {
    searchParams = new URLSearchParams();
    hardNavigateMock.mockReset();
    useLoginMock.mockReturnValue({ mutateAsync: jest.fn().mockResolvedValue({ user: { id: 'user-b' } }) });
  });

  it('does a full page load to /dashboard after login, so nothing from a previous user is reused', async () => {
    render(<LoginPage />);
    await signIn();

    await waitFor(() => expect(hardNavigateMock).toHaveBeenCalledWith('/dashboard'));
  });

  it('honours a same-site redirectTo', async () => {
    searchParams = new URLSearchParams({ redirectTo: '/reports' });
    render(<LoginPage />);
    await signIn();

    await waitFor(() => expect(hardNavigateMock).toHaveBeenCalledWith('/reports'));
  });

  it('ignores a redirectTo that would leave the site', async () => {
    searchParams = new URLSearchParams({ redirectTo: '//evil.example' });
    render(<LoginPage />);
    await signIn();

    await waitFor(() => expect(hardNavigateMock).toHaveBeenCalledWith('/dashboard'));
  });

  it('stays on the form when login fails', async () => {
    const { ClientApiError } = jest.requireActual('@/lib/api/client-fetch');
    useLoginMock.mockReturnValue({ mutateAsync: jest.fn().mockRejectedValue(new ClientApiError(401, 'Invalid email or password')) });
    render(<LoginPage />);
    await signIn();

    expect(await screen.findByText('Invalid email or password')).toBeInTheDocument();
    expect(hardNavigateMock).not.toHaveBeenCalled();
  });
});
