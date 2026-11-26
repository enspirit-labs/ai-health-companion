import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import Link from 'next/link';

import { Badge } from './badge';

describe('Badge', () => {
  it('renders its children', () => {
    render(<Badge>Low risk</Badge>);
    expect(screen.getByText('Low risk')).toBeInTheDocument();
  });

  it('renders as the child element when asChild is set', () => {
    render(
      <Badge asChild>
        <Link href="/reports/1">Report</Link>
      </Badge>,
    );
    expect(screen.getByRole('link', { name: 'Report' })).toHaveAttribute('href', '/reports/1');
  });

  it('has no axe violations', async () => {
    const { container } = render(<Badge variant="critical">High</Badge>);
    expect(await axe(container)).toHaveNoViolations();
  });

  // (Critical): status variants used to mix raw hex arbitrary-value
  // classes with token refs (`text-[#8a6200]` next to `dark:text-status-warning`)
  // — all four should now resolve through one token-based scheme instead.
  it.each(['good', 'warning', 'serious', 'critical'] as const)(
    'variant "%s" uses a color token instead of a raw hex class',
    (variant) => {
      render(<Badge variant={variant}>Label</Badge>);
      expect(screen.getByText('Label').className).not.toMatch(/text-\[#/);
    },
  );
});
