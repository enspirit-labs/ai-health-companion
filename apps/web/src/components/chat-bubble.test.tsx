import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { ChatBubble, initialsFromName } from './chat-bubble';

describe('ChatBubble', () => {
  it('renders its content', () => {
    render(<ChatBubble role="assistant">Hello there</ChatBubble>);
    expect(screen.getByText('Hello there')).toBeInTheDocument();
  });

  // assistant bubbles must be distinct from the page background —
  // bg-muted (#eceae6) was near-identical to --background (#f6f5f3).
  it('gives an assistant bubble the elevated card surface rather than the flat muted one', () => {
    render(<ChatBubble role="assistant">Hello there</ChatBubble>);
    const bubble = screen.getByText('Hello there');
    expect(bubble).toHaveClass('bg-card', 'border', 'shadow-sm');
    expect(bubble).not.toHaveClass('bg-muted');
  });

  // user and assistant bubbles distinct from each other.
  it('gives a user bubble the primary surface', () => {
    render(<ChatBubble role="user">Hi</ChatBubble>);
    expect(screen.getByText('Hi')).toHaveClass('bg-primary', 'text-primary-foreground');
  });

  // every message renders with a role-appropriate avatar.
  it('renders the user initials in the avatar of a user message', () => {
    render(
      <ChatBubble role="user" initials="AL">
        Hi
      </ChatBubble>,
    );
    expect(screen.getByText('AL')).toBeInTheDocument();
  });

  it('falls back to a glyph avatar when no initials are available', () => {
    const { container } = render(<ChatBubble role="user">Hi</ChatBubble>);
    expect(container.querySelector('[data-slot="avatar-fallback"] svg')).toBeInTheDocument();
  });

  it('renders the brand mark as the assistant avatar', () => {
    const { container } = render(<ChatBubble role="assistant">Hello there</ChatBubble>);
    expect(container.querySelector('[data-slot="avatar-fallback"] svg')).toBeInTheDocument();
  });

  // a11y: speaker identity must not depend on colour/icon alone.
  it.each([
    ['user' as const, 'You said'],
    ['assistant' as const, 'AI Health Coach said'],
  ])('names the %s speaker in text for screen readers', (role, label) => {
    render(<ChatBubble role={role}>Message</ChatBubble>);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('hides the decorative avatar from assistive technology', () => {
    const { container } = render(
      <ChatBubble role="user" initials="AL">
        Hi
      </ChatBubble>,
    );
    expect(container.querySelector('[data-slot="avatar"]')).toHaveAttribute('aria-hidden', 'true');
  });

  it('applies a caller className to the bubble, not the row', () => {
    render(
      <ChatBubble role="assistant" className="text-muted-foreground">
        Hello there
      </ChatBubble>,
    );
    expect(screen.getByText('Hello there')).toHaveClass('text-muted-foreground');
  });

  it.each([['user' as const], ['assistant' as const]])('has no axe violations for a %s bubble', async (role) => {
    const { container } = render(
      <ChatBubble role={role} initials="AL">
        Hi
      </ChatBubble>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('initialsFromName', () => {
  it.each([
    ['Ada Lovelace', 'AL'],
    ['ada lovelace', 'AL'],
    ['Ada', 'A'],
    ['  Ada   Byron   Lovelace  ', 'AL'],
    ['', null],
    ['   ', null],
    [null, null],
    [undefined, null],
  ])('maps %p to %p', (input, expected) => {
    expect(initialsFromName(input)).toBe(expected);
  });
});
