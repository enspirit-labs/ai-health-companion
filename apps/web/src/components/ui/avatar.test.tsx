import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { Avatar, AvatarFallback } from './avatar';

describe('Avatar', () => {
  it('renders its fallback when there is no image', () => {
    render(
      <Avatar>
        <AvatarFallback>AL</AvatarFallback>
      </Avatar>,
    );
    expect(screen.getByText('AL')).toBeInTheDocument();
  });

  it('merges a caller className onto the root', () => {
    const { container } = render(
      <Avatar className="size-10">
        <AvatarFallback>AL</AvatarFallback>
      </Avatar>,
    );
    expect(container.querySelector('[data-slot="avatar"]')).toHaveClass('size-10', 'rounded-full');
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <Avatar>
        <AvatarFallback>AL</AvatarFallback>
      </Avatar>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
