import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { Checkbox } from './checkbox';
import { Label } from './label';

describe('Checkbox', () => {
  it('toggles checked state on click', async () => {
    const user = userEvent.setup();
    render(<Checkbox aria-label="Consent" />);
    const checkbox = screen.getByRole('checkbox', { name: 'Consent' });
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it('is associated with its label', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Checkbox id="consent" />
        <Label htmlFor="consent">I agree</Label>
      </>,
    );
    const checkbox = screen.getByRole('checkbox', { name: 'I agree' });
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it('does not toggle when disabled', async () => {
    const user = userEvent.setup();
    render(<Checkbox aria-label="Consent" disabled />);
    const checkbox = screen.getByRole('checkbox', { name: 'Consent' });
    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it('has no axe violations', async () => {
    // axe's button-name rule doesn't credit an external <label for> as an
    // accessible name source for a button-rendered role="checkbox" (Radix
    // renders Checkbox as a <button>), so this uses aria-label directly to
    // test the primitive's own accessibility rather than a specific
    // integration pattern.
    const { container } = render(<Checkbox aria-label="I agree" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
