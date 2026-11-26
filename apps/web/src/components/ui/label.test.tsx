import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { Input } from './input';
import { Label } from './label';

describe('Label', () => {
  it('associates with its control via htmlFor', () => {
    render(
      <>
        <Label htmlFor="email">Email address</Label>
        <Input id="email" />
      </>,
    );
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <>
        <Label htmlFor="email">Email address</Label>
        <Input id="email" />
      </>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
