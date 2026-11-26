import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import Link from 'next/link';

import { Button } from './button';

describe('Button', () => {
  it('renders as a button by default and fires onClick', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Save</Button>);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders as the child element when asChild is set', () => {
    render(
      <Button asChild>
        <Link href="/dashboard">Dashboard</Link>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Dashboard' });
    expect(link).toHaveAttribute('href', '/dashboard');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('does not fire onClick when disabled', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    render(
      <Button onClick={onClick} disabled>
        Save
      </Button>,
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('has no axe violations', async () => {
    const { container } = render(<Button>Save</Button>);
    expect(await axe(container)).toHaveNoViolations();
  });

  // the outline variant (used by e.g. the capture-screen
  // "Retake" button) must set its own text color rather than inherit an
  // ancestor's, so it stays legible regardless of surrounding context/theme.
  it('gives the outline variant an explicit foreground text color', () => {
    render(<Button variant="outline">Retake</Button>);
    expect(screen.getByRole('button', { name: 'Retake' }).className).toMatch(/\btext-foreground\b/);
  });
});
