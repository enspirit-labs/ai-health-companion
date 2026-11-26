import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { LoadingState } from './loading-state';

describe('LoadingState', () => {
  it('renders the default label in a live region', () => {
    render(<LoadingState />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Loading…');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveAttribute('aria-busy', 'true');
  });

  it('renders a custom label', () => {
    render(<LoadingState label="Loading reports…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading reports…');
  });

  it('marks the spinner decorative', () => {
    const { container } = render(<LoadingState />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('has no axe violations', async () => {
    const { container } = render(<LoadingState label="Loading reports…" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
