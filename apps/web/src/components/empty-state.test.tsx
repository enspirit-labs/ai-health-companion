import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { FileText } from 'lucide-react';

import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  it('renders the message', () => {
    render(<EmptyState icon={FileText} message="No reports yet." />);
    expect(screen.getByRole('status')).toHaveTextContent('No reports yet.');
  });

  it('renders an action when provided', () => {
    render(<EmptyState icon={FileText} message="No reports yet." action={<button>Start assessment</button>} />);
    expect(screen.getByRole('button', { name: 'Start assessment' })).toBeInTheDocument();
  });

  it('omits the action wrapper when not provided', () => {
    const { container } = render(<EmptyState icon={FileText} message="Empty" />);
    expect(container.querySelector('button')).toBeNull();
  });

  it('marks the icon decorative', () => {
    const { container } = render(<EmptyState icon={FileText} message="Empty" />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders without an icon', () => {
    const { container } = render(<EmptyState message="No users yet." />);
    expect(container.querySelector('svg')).toBeNull();
    expect(screen.getByText('No users yet.')).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = render(<EmptyState icon={FileText} message="No reports yet." />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
