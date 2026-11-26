import Link from 'next/link';
import { HeartPulse } from 'lucide-react';

// /login, /signup etc. were prerendered and served with a year-long s-maxage.
// Whether a visitor gets the form or a redirect depends on their session, so
// these must render per request and never be cached by a CDN.
export const dynamic = 'force-dynamic';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main-content" className="flex flex-1 flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 flex items-center gap-2 text-lg font-medium">
        <HeartPulse className="size-5 text-primary" />
        AI Health Companion
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
