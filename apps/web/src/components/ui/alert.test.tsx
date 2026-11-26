import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { Alert } from './alert';

describe('Alert', () => {
  it('renders an error alert with an assertive role', () => {
    render(<Alert variant="error" title="Something went wrong">Please try again.</Alert>);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getByRole('alert')).toHaveTextContent('Please try again.');
  });

  it('renders non-error variants with a polite status role', () => {
    render(<Alert variant="success" title="Saved">Your changes were saved.</Alert>);
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });

  it('renders without a title', () => {
    render(<Alert variant="info">Just a message.</Alert>);
    expect(screen.getByText('Just a message.')).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = render(<Alert variant="warning" title="Heads up">Review before continuing.</Alert>);
    expect(await axe(container)).toHaveNoViolations();
  });
});
