import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { Input } from './input';

describe('Input', () => {
  it('accepts typed input', async () => {
    const user = userEvent.setup();
    render(<Input aria-label="Email" />);
    const input = screen.getByLabelText('Email');
    await user.type(input, 'ada@example.com');
    expect(input).toHaveValue('ada@example.com');
  });

  it('marks itself invalid via aria-invalid', () => {
    render(<Input aria-label="Email" aria-invalid />);
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('does not accept input when disabled', async () => {
    const user = userEvent.setup();
    render(<Input aria-label="Email" disabled />);
    const input = screen.getByLabelText('Email');
    await user.type(input, 'ada@example.com');
    expect(input).toHaveValue('');
  });

  it('has no axe violations', async () => {
    const { container } = render(<Input aria-label="Email" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
