import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { Progress } from './progress';

describe('Progress', () => {
  it('exposes a progressbar role with a 0-100 range', () => {
    render(<Progress value={40} aria-label="Assessment progress" />);
    const progress = screen.getByRole('progressbar', { name: 'Assessment progress' });
    expect(progress).toHaveAttribute('aria-valuemin', '0');
    expect(progress).toHaveAttribute('aria-valuemax', '100');
  });

  it("reflects value visually via the indicator's transform", () => {
    render(<Progress value={40} aria-label="Assessment progress" data-testid="progress" />);
    const indicator = screen.getByTestId('progress').firstChild as HTMLElement;
    expect(indicator).toHaveStyle({ transform: 'translateX(-60%)' });
  });

  it('has no axe violations', async () => {
    const { container } = render(<Progress value={60} aria-label="Assessment progress" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
