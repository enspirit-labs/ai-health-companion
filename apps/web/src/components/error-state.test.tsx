import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { ErrorState } from './error-state';

describe('ErrorState', () => {
  it('renders default copy in an alert region', () => {
    render(<ErrorState />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong');
  });

  it('renders custom title and description', () => {
    render(<ErrorState title="Could not load reports" description="Check your connection." />);
    expect(screen.getByText('Could not load reports')).toBeInTheDocument();
    expect(screen.getByText('Check your connection.')).toBeInTheDocument();
  });

  it('omits the retry button when onRetry is not provided', () => {
    render(<ErrorState />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('calls onRetry when the retry button is clicked', async () => {
    const user = userEvent.setup();
    const onRetry = jest.fn();
    render(<ErrorState onRetry={onRetry} retryLabel="Retry loading reports" />);
    await user.click(screen.getByRole('button', { name: 'Retry loading reports' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('has no axe violations', async () => {
    const { container } = render(<ErrorState onRetry={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
