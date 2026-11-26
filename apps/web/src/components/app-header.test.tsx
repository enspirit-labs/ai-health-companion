import { render, screen } from '@testing-library/react';
import { AppHeader } from './app-header';

// ResizeObserver is not implemented in jsdom — same pattern as
// dropdown-menu.test.tsx. AppHeader uses it to publish --header-height.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
});

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@/lib/auth/use-auth', () => ({
  useCurrentUser: jest.fn(() => ({ data: null })),
  useLogout: jest.fn(() => ({ mutate: jest.fn() })),
  useTimezoneSync: jest.fn(),
}));

describe('AppHeader', () => {
  describe('wordmark and logo link', () => {
    it('dashboard logo link aria-label uses a comma, not an em-dash', () => {
      render(<AppHeader />);
      // Verifies the em-dash was replaced: "AI Health Companion, go to dashboard"
      expect(
        screen.getByRole('link', { name: 'AI Health Companion, go to dashboard' }),
      ).toBeInTheDocument();
    });

    it('visible wordmark reads "AI Health Companion"', () => {
      render(<AppHeader />);
      expect(screen.getByText('AI Health Companion')).toBeInTheDocument();
    });
  });
});
