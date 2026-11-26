import { render, screen } from '@testing-library/react';

import { useCurrentUser } from '@/lib/auth/use-auth';
import { useUpdateConsent } from '@/lib/consent/use-consent';
import { ConsentGate } from './consent-gate';

jest.mock('@/lib/auth/use-auth', () => ({ useCurrentUser: jest.fn() }));
jest.mock('@/lib/consent/use-consent', () => ({ useUpdateConsent: jest.fn() }));

const mockUseCurrentUser = useCurrentUser as jest.Mock;
const mockUseUpdateConsent = useUpdateConsent as jest.Mock;

describe('ConsentGate', () => {
  beforeEach(() => {
    mockUseUpdateConsent.mockReturnValue({ isPending: false, mutate: jest.fn() });
  });

  it('shows a loading state while the user is loading', () => {
    mockUseCurrentUser.mockReturnValue({ data: undefined, isLoading: true });
    render(
      <ConsentGate type="CAMERA">
        <p>protected content</p>
      </ConsentGate>,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('protected content')).toBeNull();
  });

  it('renders children directly once consent is already granted', () => {
    mockUseCurrentUser.mockReturnValue({ data: { consentCamera: true, consentMicrophone: false }, isLoading: false });
    render(
      <ConsentGate type="CAMERA">
        <p>protected content</p>
      </ConsentGate>,
    );
    expect(screen.getByText('protected content')).toBeInTheDocument();
  });

  it('offers a skip path when consent has not been granted', () => {
    mockUseCurrentUser.mockReturnValue({ data: { consentCamera: false, consentMicrophone: false }, isLoading: false });
    render(
      <ConsentGate type="CAMERA">
        <p>protected content</p>
      </ConsentGate>,
    );
    expect(screen.getByRole('button', { name: /not now/i })).toBeInTheDocument();
    expect(screen.getByText(/skip anytime/i)).toBeInTheDocument();
    expect(screen.queryByText('protected content')).toBeNull();
  });
});
