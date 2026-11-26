import { render, screen, within } from '@testing-library/react';

import PrivacyPage from './privacy/page';
import TermsPage from './terms/page';

const ALL_TEXT = () => document.body.textContent ?? '';

describe('PrivacyPage', () => {
  it('has a level-1 heading, the last-updated date and the main sections', () => {
    render(<PrivacyPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Privacy' })).toBeInTheDocument();
    expect(screen.getByText(/Last updated: 27 October 2026/)).toBeInTheDocument();
    for (const name of ['Who we are', 'What data we handle', 'Who processes it', 'Your choices', 'How long we keep it', 'Your rights', 'Contact']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
  });

  it('names Anthropic (USA) and the India hosting', () => {
    render(<PrivacyPage />);

    const section = screen.getByRole('region', { name: 'Who processes it' });
    expect(within(section).getByText(/Anthropic, in the USA/)).toBeInTheDocument();
    expect(within(section).getByText(/currently in India/)).toBeInTheDocument();
  });

  it('says export and account deletion are available in Your data', () => {
    render(<PrivacyPage />);

    expect(screen.getByRole('link', { name: /Your data/ })).toHaveAttribute('href', '/settings/data');
    expect(screen.getByText(/download a copy of your data/)).toBeInTheDocument();
  });

  it('states the 30-day raw media retention and that scores and reports are kept', () => {
    render(<PrivacyPage />);

    const section = screen.getByRole('region', { name: 'How long we keep it' });
    expect(within(section).getByText(/deleted automatically 30\s+days after/)).toBeInTheDocument();
    expect(within(section).getByText(/scores and reports are kept/)).toBeInTheDocument();
  });

  it('links to the privacy settings page', () => {
    render(<PrivacyPage />);

    expect(screen.getByRole('link', { name: /Settings.*Privacy/ })).toHaveAttribute('href', '/settings/privacy');
  });

  describe('contact', () => {
    const original = process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL;
    afterEach(() => {
      if (original === undefined) delete process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL;
      else process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL = original;
    });

    it('shows a generic sentence and no mailto link when no email is configured', () => {
      delete process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL;
      render(<PrivacyPage />);

      expect(screen.getByText(/Ask the Enspirit team who gave you access/)).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /@/ })).not.toBeInTheDocument();
    });

    it('renders a mailto link when an email is configured', () => {
      process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL = 'privacy@example.test';
      render(<PrivacyPage />);

      expect(screen.getByRole('link', { name: 'privacy@example.test' })).toHaveAttribute(
        'href',
        'mailto:privacy@example.test',
      );
    });
  });
});

describe('TermsPage', () => {
  it('has a level-1 heading, the last-updated date and the main sections', () => {
    render(<TermsPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Terms of use' })).toBeInTheDocument();
    expect(screen.getByText(/Last updated: 27 October 2026/)).toBeInTheDocument();
    for (const name of ['Acceptable use', 'Wellness only, not medical advice', 'Limits of the AI', 'Availability', 'Liability']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
  });

  it('has no unfinished governing-law placeholder', () => {
    render(<TermsPage />);

    expect(screen.queryByRole('heading', { level: 2, name: 'Governing law' })).not.toBeInTheDocument();
    expect(screen.queryByText(/To be confirmed/)).not.toBeInTheDocument();
  });

  it('repeats the emergency line and links to the privacy page', () => {
    render(<TermsPage />);

    expect(screen.getByText(/contact your local emergency services/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Privacy page' })).toHaveAttribute('href', '/privacy');
  });
});
