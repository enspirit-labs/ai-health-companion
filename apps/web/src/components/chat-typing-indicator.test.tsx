import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { useReducedMotion } from 'framer-motion';

import { ChatTypingIndicator } from './chat-typing-indicator';

// Only the reduced-motion preference is stubbed; the real motion components
// still render, so the animated path is exercised as shipped.
jest.mock('framer-motion', () => ({
  ...jest.requireActual('framer-motion'),
  useReducedMotion: jest.fn(() => false),
}));

const mockUseReducedMotion = useReducedMotion as jest.Mock;

function dots(container: HTMLElement) {
  return Array.from(container.querySelectorAll('[data-slot="chat-typing-dot"]'));
}

describe('ChatTypingIndicator', () => {
  beforeEach(() => {
    mockUseReducedMotion.mockReturnValue(false);
  });

  // the literal "Thinking…" label is replaced by an announced status.
  it('exposes a polite status with a visually-hidden typing label', () => {
    render(<ChatTypingIndicator />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('AI Health Coach is typing');
  });

  it('renders three animated dots by default', () => {
    const { container } = render(<ChatTypingIndicator />);
    const rendered = dots(container);
    expect(rendered).toHaveLength(3);
    rendered.forEach((dot) => expect(dot).toHaveAttribute('data-motion', 'pulse'));
  });

  // reduced-motion fallback.
  it('renders static dots when the user prefers reduced motion', () => {
    mockUseReducedMotion.mockReturnValue(true);
    const { container } = render(<ChatTypingIndicator />);
    const rendered = dots(container);
    expect(rendered).toHaveLength(3);
    rendered.forEach((dot) => expect(dot).toHaveAttribute('data-motion', 'static'));
  });

  it('renders the assistant avatar so the indicator reads as the next turn', () => {
    const { container } = render(<ChatTypingIndicator />);
    expect(container.querySelector('[data-slot="avatar"]')).toHaveAttribute('aria-hidden', 'true');
  });

  it('has no axe violations', async () => {
    const { container } = render(<ChatTypingIndicator />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
