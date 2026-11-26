import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { FormField } from './form-field';

describe('FormField', () => {
  it('associates the label with the control', () => {
    render(
      <FormField label="Email" htmlFor="email">
        <input id="email" />
      </FormField>,
    );
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('wires aria-invalid and aria-describedby to the control when there is an error', () => {
    render(
      <FormField label="Email" htmlFor="email" error="Required">
        <input id="email" />
      </FormField>,
    );
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
    expect(input).toHaveAccessibleDescription('Required');
  });

  it('does not mark the control invalid when there is no error', () => {
    render(
      <FormField label="Email" htmlFor="email">
        <input id="email" />
      </FormField>,
    );
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <FormField label="Email" htmlFor="email" error="Required">
        <input id="email" />
      </FormField>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
