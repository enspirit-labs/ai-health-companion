import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

// Radix's popper-based positioning (SelectContent's default position="popper")
// calls ResizeObserver, which jsdom doesn't implement.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  window.ResizeObserver = ResizeObserverStub;
});

function ExampleSelect({ defaultOpen = false }: { defaultOpen?: boolean }) {
  return (
    <Select defaultOpen={defaultOpen}>
      <SelectTrigger aria-label="Assessment">
        <SelectValue placeholder="Select an assessment" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="squats">Squats</SelectItem>
        <SelectItem value="walking">Walking</SelectItem>
      </SelectContent>
    </Select>
  );
}

describe('Select', () => {
  it('shows the placeholder when nothing is selected', () => {
    render(<ExampleSelect />);
    expect(screen.getByRole('combobox', { name: 'Assessment' })).toHaveTextContent('Select an assessment');
  });

  it('does not render its options until opened', () => {
    render(<ExampleSelect />);
    expect(screen.queryByRole('option')).toBeNull();
  });

  it('renders its options when open', () => {
    render(<ExampleSelect defaultOpen />);
    expect(screen.getByRole('option', { name: 'Squats' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Walking' })).toBeInTheDocument();
  });

  it('has no axe violations when closed', async () => {
    const { container } = render(<ExampleSelect />);
    expect(await axe(container)).toHaveNoViolations();
  });

  // (Critical): the trigger's default h-9 (36px) is below the 44px WCAG
  // 2.5.5 / iOS HIG touch-target minimum — coarse:h-11 bumps it on touch devices.
  it('bumps its height for coarse (touch) pointers', () => {
    render(<ExampleSelect />);
    expect(screen.getByRole('combobox', { name: 'Assessment' })).toHaveClass('coarse:h-11');
  });
});
