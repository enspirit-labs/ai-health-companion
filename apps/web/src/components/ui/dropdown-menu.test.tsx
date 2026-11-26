import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { Button } from './button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu';

// Radix's popper-based positioning (DropdownMenuContent's sideOffset) calls
// ResizeObserver, which jsdom doesn't implement.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  window.ResizeObserver = ResizeObserverStub;
});

function ExampleMenu({ defaultOpen = false }: { defaultOpen?: boolean }) {
  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger asChild>
        <Button>Actions</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>View report</DropdownMenuItem>
        <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe('DropdownMenu', () => {
  it('does not render its items until opened', () => {
    render(<ExampleMenu />);
    expect(screen.getByRole('button', { name: 'Actions' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('renders its items when open', () => {
    render(<ExampleMenu defaultOpen />);
    expect(screen.getByRole('menuitem', { name: 'View report' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument();
  });

  it('has no axe violations when open', async () => {
    const { container } = render(<ExampleMenu defaultOpen />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
