import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useCurrentUser } from '@/lib/auth/use-auth';
import { useUpdateConsent } from '@/lib/consent/use-consent';
import { AiConsentGate } from './ai-consent-gate';

jest.mock('@/lib/auth/use-auth', () => ({ useCurrentUser: jest.fn() }));
jest.mock('@/lib/consent/use-consent', () => ({ useUpdateConsent: jest.fn() }));

const mockUseCurrentUser = useCurrentUser as jest.Mock;
const mockUseUpdateConsent = useUpdateConsent as jest.Mock;

describe('AiConsentGate', () => {
  let mutate: jest.Mock;

  beforeEach(() => {
    mutate = jest.fn((_vars, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
    mockUseUpdateConsent.mockReturnValue({ isPending: false, isError: false, mutate });
  });

  it('shows a loading state while the user is loading', () => {
    mockUseCurrentUser.mockReturnValue({ data: undefined, isLoading: true });
    render(
      <AiConsentGate>
        <p>protected content</p>
      </AiConsentGate>,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('protected content')).toBeNull();
  });

  it('renders children once AI analysis is allowed', () => {
    mockUseCurrentUser.mockReturnValue({ data: { consentAiProcessing: true }, isLoading: false });
    render(
      <AiConsentGate>
        <p>protected content</p>
      </AiConsentGate>,
    );
    expect(screen.getByText('protected content')).toBeInTheDocument();
  });

  it('explains what is sent to whom and withholds children when not allowed', () => {
    mockUseCurrentUser.mockReturnValue({ data: { consentAiProcessing: false }, isLoading: false });
    render(
      <AiConsentGate>
        <p>protected content</p>
      </AiConsentGate>,
    );
    expect(screen.getByText(/sent to anthropic \(usa\)/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /not now/i })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: /privacy settings/i })).toHaveAttribute('href', '/settings/privacy');
    expect(screen.queryByText('protected content')).toBeNull();
  });

  it('records DATA_PROCESSING granted and calls onGranted when the user allows', async () => {
    const onGranted = jest.fn();
    mockUseCurrentUser.mockReturnValue({ data: { consentAiProcessing: false }, isLoading: false });
    render(
      <AiConsentGate onGranted={onGranted}>
        <p>protected content</p>
      </AiConsentGate>,
    );
    await userEvent.click(screen.getByRole('button', { name: /allow ai analysis/i }));
    expect(mutate).toHaveBeenCalledWith({ type: 'DATA_PROCESSING', granted: true }, expect.any(Object));
    expect(onGranted).toHaveBeenCalled();
  });

  it('calls onDismiss for "Not now" when provided, without recording anything', async () => {
    const onDismiss = jest.fn();
    mockUseCurrentUser.mockReturnValue({ data: { consentAiProcessing: false }, isLoading: false });
    render(
      <AiConsentGate onDismiss={onDismiss}>
        <p>protected content</p>
      </AiConsentGate>,
    );
    await userEvent.click(screen.getByRole('button', { name: /not now/i }));
    expect(onDismiss).toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('shows an alert if saving the choice fails', () => {
    mockUseCurrentUser.mockReturnValue({ data: { consentAiProcessing: false }, isLoading: false });
    mockUseUpdateConsent.mockReturnValue({ isPending: false, isError: true, mutate });
    render(
      <AiConsentGate>
        <p>x</p>
      </AiConsentGate>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn.t save/i);
  });
});
