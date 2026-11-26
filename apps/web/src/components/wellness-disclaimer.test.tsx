import { WELLNESS_DISCLAIMER } from '@aidoctor/shared';
import { render, screen, within } from '@testing-library/react';

import { InlineWellnessDisclaimer, WellnessDisclaimer } from './wellness-disclaimer';

describe('WellnessDisclaimer', () => {
  it('shows the wellness disclaimer text in the global footer', () => {
    render(<WellnessDisclaimer />);

    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByText(WELLNESS_DISCLAIMER)).toBeInTheDocument();
  });

  it('links the Enspirit logo to enspirit.co and carries no credit line', () => {
    render(<WellnessDisclaimer />);

    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByRole('link', { name: 'Enspirit' })).toHaveAttribute(
      'href',
      'https://enspirit.co',
    );
    expect(within(footer).queryByText(/Ignite AI Hackathon/)).not.toBeInTheDocument();
  });

  it('links to the privacy and terms pages', () => {
    render(<WellnessDisclaimer />);

    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
    expect(within(footer).getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
  });
});

describe('InlineWellnessDisclaimer', () => {
  it('shows the wellness disclaimer text', () => {
    render(<InlineWellnessDisclaimer />);

    expect(screen.getByText(WELLNESS_DISCLAIMER)).toBeInTheDocument();
  });
});
