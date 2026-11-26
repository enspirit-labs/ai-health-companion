import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { MediaErrorState } from './media-error-state';

describe('MediaErrorState', () => {
  it('renders the error message in an alert region', () => {
    render(<MediaErrorState error={{ kind: 'denied', message: 'Camera access was denied.' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Camera access was denied.');
  });

  it('renders distinct copy for an unavailable device', () => {
    render(<MediaErrorState error={{ kind: 'unavailable', message: 'No camera was found on this device.' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('No camera was found on this device.');
  });

  it('has no axe violations', async () => {
    const { container } = render(<MediaErrorState error={{ kind: 'insecure', message: 'Needs HTTPS.' }} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
