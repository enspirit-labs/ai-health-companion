import { render, screen } from '@testing-library/react';

import { MockModeBanner } from './mock-mode-banner';
import { useProviderMode } from '@/lib/provider-mode/use-provider-mode';

jest.mock('@/lib/provider-mode/use-provider-mode', () => ({
  useProviderMode: jest.fn(),
}));

const mockUseProviderMode = useProviderMode as jest.Mock;

describe('MockModeBanner', () => {
  it('shows a status banner when the mock provider is active', () => {
    mockUseProviderMode.mockReturnValue({ data: { mock: true } });
    render(<MockModeBanner />);

    expect(screen.getByRole('status')).toHaveTextContent(/mock provider/i);
  });

  it('renders nothing when a real provider is active', () => {
    mockUseProviderMode.mockReturnValue({ data: { mock: false } });
    render(<MockModeBanner />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders nothing while loading or on error', () => {
    mockUseProviderMode.mockReturnValue({ data: undefined });
    render(<MockModeBanner />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
