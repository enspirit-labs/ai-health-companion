import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useCurrentUser } from '@/lib/auth/use-auth';
import { useUpdateConsent } from '@/lib/consent/use-consent';
import PrivacySettingsPage from './page';

jest.mock('@/lib/auth/use-auth', () => ({ useCurrentUser: jest.fn() }));
jest.mock('@/lib/consent/use-consent', () => ({ useUpdateConsent: jest.fn() }));

const mockUseCurrentUser = useCurrentUser as jest.Mock;
const mockUseUpdateConsent = useUpdateConsent as jest.Mock;

describe('PrivacySettingsPage', () => {
  let mutate: jest.Mock;

  beforeEach(() => {
    mutate = jest.fn();
    mockUseUpdateConsent.mockReturnValue({ isPending: false, isError: false, mutate });
    mockUseCurrentUser.mockReturnValue({
      isLoading: false,
      data: { consentCamera: true, consentMicrophone: false, consentAiProcessing: true },
    });
  });

  it('shows a switch each for camera, microphone and AI analysis reflecting the current consent', () => {
    render(<PrivacySettingsPage />);
    expect(screen.getByRole('switch', { name: 'Camera' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Microphone' })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: 'AI analysis' })).toBeChecked();
  });

  it('withdraws AI analysis in one click with granted: false', async () => {
    render(<PrivacySettingsPage />);
    await userEvent.click(screen.getByRole('switch', { name: 'AI analysis' }));
    expect(mutate).toHaveBeenCalledWith({ type: 'DATA_PROCESSING', granted: false });
  });

  it('grants microphone consent when switched on', async () => {
    render(<PrivacySettingsPage />);
    await userEvent.click(screen.getByRole('switch', { name: 'Microphone' }));
    expect(mutate).toHaveBeenCalledWith({ type: 'MICROPHONE', granted: true });
  });

  it('asks a signed-out visitor to sign in', () => {
    mockUseCurrentUser.mockReturnValue({ isLoading: false, data: null });
    render(<PrivacySettingsPage />);
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('shows an alert when a change could not be saved', () => {
    mockUseUpdateConsent.mockReturnValue({ isPending: false, isError: true, mutate });
    render(<PrivacySettingsPage />);
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn.t save/i);
  });
});
