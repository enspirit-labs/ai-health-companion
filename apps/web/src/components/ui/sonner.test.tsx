import { render } from '@testing-library/react';
import { axe } from 'jest-axe';

import { Toaster } from './sonner';

// Sonner resolves the 'system' theme (the default when no ThemeProvider is
// present) via matchMedia, which jsdom doesn't implement.
beforeAll(() => {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
});

describe('Toaster', () => {
  it('renders without a ThemeProvider and with no toasts visible', () => {
    const { container } = render(<Toaster />);
    expect(container.querySelectorAll('li')).toHaveLength(0);
  });

  it('has no axe violations in its empty state', async () => {
    const { container } = render(<Toaster />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
