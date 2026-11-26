import Link from 'next/link';
import { HeartPulse } from 'lucide-react';
import type { ReactNode } from 'react';

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

export const LEGAL_LAST_UPDATED = '27 October 2026';

/** Shared layout for the public policy pages (/privacy, /terms). */
export function LegalPage({ title, intro, sections }: { title: string; intro: ReactNode; sections: LegalSection[] }) {
  return (
    <main id="main-content" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
      <Link href="/" className="mb-8 flex items-center gap-2 text-lg font-medium">
        <HeartPulse className="size-5 text-primary" aria-hidden="true" />
        AI Health Companion
      </Link>
      <article className="space-y-8">
        <header className="space-y-3">
          <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">{title}</h1>
          <p className="text-sm text-muted-foreground">Last updated: {LEGAL_LAST_UPDATED}</p>
          <div className="space-y-3 text-muted-foreground">{intro}</div>
        </header>

        <nav aria-label="On this page" className="rounded-lg border bg-card p-4">
          <p className="mb-2 text-sm font-medium">On this page</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}-heading`} className="underline underline-offset-2 hover:text-primary">
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {sections.map((s) => (
          <section key={s.id} aria-labelledby={`${s.id}-heading`} className="space-y-3">
            <h2 id={`${s.id}-heading`} className="scroll-mt-6 text-xl font-medium">
              {s.title}
            </h2>
            <div className="space-y-3 leading-relaxed text-muted-foreground [&_a]:underline [&_a]:underline-offset-2 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
              {s.body}
            </div>
          </section>
        ))}
      </article>
    </main>
  );
}

/** Contact sentence: a mailto link only when an address is configured. */
export function ContactLine() {
  const email = process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL?.trim();
  if (email) {
    return (
      <p>
        Questions or requests about your data? Email <a href={`mailto:${email}`}>{email}</a>.
      </p>
    );
  }
  return <p>Questions or requests about your data? Ask the Enspirit team who gave you access to the app.</p>;
}
