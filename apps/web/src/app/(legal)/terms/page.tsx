import type { Metadata } from 'next';
import Link from 'next/link';

import { ContactLine, LegalPage, type LegalSection } from '@/components/legal/legal-page';

// needs review by the privacy owner and legal before wider release

export const metadata: Metadata = { title: 'Terms' };

const sections: LegalSection[] = [
  {
    id: 'about',
    title: 'About these terms',
    body: (
      <p>
        AI Health Companion is a prototype built by a team at Enspirit. By creating an account or using the app you agree to these terms.
      </p>
    ),
  },
  {
    id: 'wellness-only',
    title: 'Wellness only, not medical advice',
    body: (
      <>
        <p>
          This is a general-wellness app for adults aged 18 and over. It does not identify, check for, monitor, treat
          or prevent any health condition, and it gives no medical opinion. It is not a medical device and does not replace professional care. Talk to a
          qualified healthcare professional about any health concern.
        </p>
        <p>In an emergency, contact your local emergency services.</p>
      </>
    ),
  },
  {
    id: 'ai-limits',
    title: 'Limits of the AI',
    body: (
      <p>
        Scores and coach replies are produced by AI. They are estimates and can be wrong. They have not been validated
        clinically. Please do not make health decisions based only on them.
      </p>
    ),
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    body: (
      <ul>
        <li>Use the app only if you are 18 or over.</li>
        <li>Give accurate information and only photos of yourself.</li>
        <li>Do not try to break, overload or get around the security of the app.</li>
        <li>Do not use the app for anything unlawful or to harm others.</li>
      </ul>
    ),
  },
  {
    id: 'your-account',
    title: 'Your account',
    body: (
      <p>
        Keep your password private and tell us if you think someone else has used your account. You are responsible for
        what happens under your account.
      </p>
    ),
  },
  {
    id: 'availability',
    title: 'Availability',
    body: (
      <p>
        This is a prototype. It may change, stop working or be taken down at any time, and we give no guarantees about
        availability or accuracy.
      </p>
    ),
  },
  {
    id: 'liability',
    title: 'Liability',
    body: (
      <p>
        The app is provided as it is. To the extent the law allows, Enspirit is not responsible for losses that come
        from relying on the app&apos;s scores or replies. Nothing here limits any right you have that cannot be
        limited by law.
      </p>
    ),
  },
  {
    id: 'your-data',
    title: 'Your data',
    body: (
      <p>
        How we handle your data is explained on the <Link href="/privacy">Privacy page</Link>.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to these terms',
    body: <p>We may update these terms as the prototype changes. The date at the top shows when they last changed.</p>,
  },
  {
    id: 'contact',
    title: 'Contact',
    body: <ContactLine />,
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      intro={<p>These terms explain the rules for using the app, in plain language.</p>}
      sections={sections}
    />
  );
}
