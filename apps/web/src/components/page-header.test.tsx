import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { PageHeader } from './page-header';

describe('PageHeader', () => {
  it('renders the title as a heading', () => {
    render(<PageHeader title="Reports" />);
    expect(screen.getByRole('heading', { name: 'Reports' })).toBeInTheDocument();
  });

  it('omits the back button when backHref is not provided', () => {
    render(<PageHeader title="Reports" />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('renders a back link when backHref is provided', () => {
    render(<PageHeader title="Reports" backHref="/dashboard" backLabel="Dashboard" />);
    expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/dashboard');
  });

  it('renders actions and description', () => {
    render(<PageHeader title="Reports" description="All your wellness reports." actions={<button>Export</button>} />);
    expect(screen.getByText('All your wellness reports.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <PageHeader title="Reports" backHref="/dashboard" description="All your wellness reports." />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
