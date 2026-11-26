import type { Metadata } from 'next';
import Link from 'next/link';

import { ContactLine, LegalPage, type LegalSection } from '@/components/legal/legal-page';

// needs review by the privacy owner and legal before wider release

export const metadata: Metadata = { title: 'Privacy' };

const sections: LegalSection[] = [
  {
    id: 'who-we-are',
    title: 'Who we are',
    body: (
      <p>
        AI Health Companion is a prototype built by a team at Enspirit. It is not a finished commercial product.
      </p>
    ),
  },
  {
    id: 'intended-use',
    title: 'What the app is for',
    body: (
      <p>
        This is a general-wellness app for adults aged 18 and over. It does not identify, check for, monitor, treat or
        prevent any health condition, and it gives no medical opinion. It is not a medical device and does not replace professional care. In an emergency,
        contact your local emergency services.
      </p>
    ),
  },
  {
    id: 'data-we-handle',
    title: 'What data we handle',
    body: (
      <ul>
        <li>Account details, such as your name and email address.</li>
        <li>Your health profile answers.</li>
        <li>Your questionnaire answers.</li>
        <li>Photos you choose to take for self-checks.</li>
        <li>Your chat messages.</li>
        <li>Your scores and reports.</li>
        <li>
          Technical logs, such as your IP address and browser type, kept for security and as a record of the consents
          you give.
        </li>
      </ul>
    ),
  },
  {
    id: 'who-processes-it',
    title: 'Who processes it',
    body: (
      <ul>
        <li>
          Anthropic, in the USA, analyses your photos, answers and chat messages to produce your scores and the
          coach&apos;s replies.
        </li>
        <li>The app is hosted on Enspirit&apos;s server, which is currently in India. Your data is stored there.</li>
        <li>Face and body tracking (MediaPipe) runs on your own device.</li>
      </ul>
    ),
  },
  {
    id: 'why',
    title: 'Why we use it',
    body: (
      <p>
        We use your data to give you the app&apos;s features: self-checks, scores, reports and the wellness coach. Your
        consent is the basis for AI analysis and for using your camera or microphone.
      </p>
    ),
  },
  {
    id: 'your-choices',
    title: 'Your choices',
    body: (
      <>
        <p>
          You can allow or withdraw AI analysis, camera access and microphone access at any time in{' '}
          <Link href="/settings/privacy">Settings &rarr; Privacy</Link>.
        </p>
        <p>
          You can download a copy of your data as a JSON file, and delete your account and all your data (including any
          stored photos and recordings), in <Link href="/settings/data">Settings &rarr; Your data</Link>. Deleting is
          permanent.
        </p>
      </>
    ),
  },
  {
    id: 'retention',
    title: 'How long we keep it',
    body: (
      <p>
        We keep your data until your account is deleted. Raw photos, clips and recordings are deleted automatically 30
        days after the assessment they belong to is completed; your scores and reports are kept.
      </p>
    ),
  },
  {
    id: 'security',
    title: 'Security',
    body: (
      <p>
        Data sent between your device and the app uses HTTPS. Access to the stored data is restricted to the team
        running the prototype.
      </p>
    ),
  },
  {
    id: 'your-rights',
    title: 'Your rights',
    body: (
      <>
        <p>In short, you can:</p>
        <ul>
          <li>be told how your data is used (this page);</li>
          <li>ask us to correct data that is wrong;</li>
          <li>withdraw your consent at any time;</li>
          <li>ask us to erase your data.</li>
        </ul>
        <p>To use any of these rights, see the contact section below.</p>
      </>
    ),
  },
  {
    id: 'children',
    title: 'Children',
    body: <p>The app is for adults aged 18 and over. Please do not use it if you are under 18.</p>,
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    body: <p>We may update this page as the prototype changes. The date at the top shows when it last changed.</p>,
  },
  {
    id: 'contact',
    title: 'Contact',
    body: <ContactLine />,
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy"
      intro={<p>This page explains, in plain language, what we do with your data today.</p>}
      sections={sections}
    />
  );
}
