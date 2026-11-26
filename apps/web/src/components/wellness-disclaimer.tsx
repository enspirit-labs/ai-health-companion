import { WELLNESS_DISCLAIMER } from '@aidoctor/shared';
import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';

import { EnspiritLogo } from '@/components/enspirit-logo';
import { cn } from '@/lib/utils';

/**
 * Rendered in the root layout so it appears on every page without each
 * feature having to remember to include it.
 */
export function WellnessDisclaimer({ className }: { className?: string }) {
  return (
    <footer
      role="contentinfo"
      className={cn(
        'stripe-top stripe-top-thin w-full bg-muted/50 px-4 py-4 text-xs text-muted-foreground',
        className,
      )}
    >
      {/* max-w-5xl matches the app pages' <main>, so the footer's edges align
          with the content above it. */}
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        {/* External link, so a plain anchor rather than next/link. The image's
            alt ("Enspirit") is the link's accessible name. */}
        <a
          href="https://enspirit.co"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 self-start rounded-sm py-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 sm:self-center"
        >
          <EnspiritLogo width={100} className="sm:w-[120px]" />
        </a>
        <nav aria-label="Legal" className="flex shrink-0 gap-4">
          <Link
            href="/privacy"
            className="py-1.5 underline underline-offset-2 hover:text-foreground"
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            className="py-1.5 underline underline-offset-2 hover:text-foreground"
          >
            Terms
          </Link>
        </nav>
        {/* ml-auto pins the block to the row's right edge; max-w-md keeps it
            wrapping as a two-line block instead of one long line. */}
        <p className="text-pretty sm:ml-auto sm:max-w-md sm:text-right">{WELLNESS_DISCLAIMER}</p>
      </div>
    </footer>
  );
}

export function InlineWellnessDisclaimer({ className }: { className?: string }) {
  return (
    <p className={cn('flex items-start gap-1 text-xs text-muted-foreground', className)}>
      <ShieldAlert className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{WELLNESS_DISCLAIMER}</span>
    </p>
  );
}
