import { render, screen } from '@testing-library/react';

import { ListItemSkeleton } from './list-item-skeleton';

// (Important): loading state should show placeholder rows shaped
// like the real list items, not just a spinner — while still announcing a
// text label to assistive tech via role="status".
describe('ListItemSkeleton', () => {
  it('exposes the label via an accessible status region', () => {
    render(<ListItemSkeleton label="Loading reports…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading reports…');
  });

  it('renders the requested number of placeholder rows', () => {
    // Each row is 4 Skeleton pieces: icon avatar, title, subtitle, badge.
    const { container } = render(<ListItemSkeleton count={4} label="Loading…" />);
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBe(4 * 4);
  });

  it('defaults to 3 rows when count is not given', () => {
    const { container } = render(<ListItemSkeleton label="Loading…" />);
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBe(3 * 4);
  });
});
