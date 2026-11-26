import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { Textarea } from './textarea';

describe('Textarea', () => {
  it('accepts typed input', async () => {
    const user = userEvent.setup();
    render(<Textarea aria-label="Notes" />);
    const textarea = screen.getByLabelText('Notes');
    await user.type(textarea, 'Felt tired today.');
    expect(textarea).toHaveValue('Felt tired today.');
  });

  it('marks itself invalid via aria-invalid', () => {
    render(<Textarea aria-label="Notes" aria-invalid />);
    expect(screen.getByLabelText('Notes')).toHaveAttribute('aria-invalid', 'true');
  });

  it('has no axe violations', async () => {
    const { container } = render(<Textarea aria-label="Notes" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
