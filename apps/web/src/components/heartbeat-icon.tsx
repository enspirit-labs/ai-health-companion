import { cn } from '@/lib/utils';

/**
 * The static heart + animated ECG trace from the landing page's mark, reused
 * as the app's one loading motif (report generation, and any other
 * spinner-style wait) instead of a generic spinner — size via className.
 */
export function HeartbeatIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn('text-primary', className)}
    >
      <path
        d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
        stroke="currentColor"
        strokeWidth={1.5}
      />
      <path
        d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"
        pathLength={100}
        stroke="currentColor"
        strokeWidth={1}
        className="ecg-trace"
      />
    </svg>
  );
}
