import Link from 'next/link';
import { HeartPulse } from 'lucide-react';

import { Button } from '@/components/ui/button';

export default function HomePage() {
  return (
    <main id="main-content" className="relative flex flex-1 flex-col">
      <div className="grid flex-1 grid-cols-1 content-center items-center gap-12 px-4 py-16 xl:grid-cols-2 xl:gap-8 xl:px-16 xl:py-0">
        <div className="flex items-center justify-center">
          <div className="relative flex items-center justify-center">
            <span className="pulse-ring" aria-hidden="true" />
            <span className="pulse-ring pulse-ring--delay" aria-hidden="true" />
            {/* Custom-drawn rather than the lucide <HeartPulse/> component so the
                ECG line can be its own path, animated independently of the
                (static) heart outline. */}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="relative size-40 text-primary drop-shadow-xl sm:size-48 xl:size-64"
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
          </div>
        </div>

        <div className="flex flex-col items-center gap-8 text-center xl:items-start xl:text-left">
          <div className="flex items-center gap-2 rounded-full border bg-card px-4 py-1.5 text-sm text-muted-foreground">
            <HeartPulse className="size-4 text-primary" />
            Personal wellness assessment, powered by AI
          </div>

          <div className="max-w-xl space-y-3">
            <h1 className="text-4xl font-medium tracking-tight sm:text-5xl">
              <span className="text-foreground">AI Health </span>
              <span className="text-gradient-enspirit font-serif-accent italic">Companion</span>
            </h1>
            <p className="font-serif-accent text-lg text-muted-foreground italic">
              clarity without the clinic
            </p>
            <p className="text-lg text-muted-foreground">
              Guided wellness assessments for your face, eyes, skin, teeth, mobility, mind, and
              lifestyle. Tracking runs on your device; AI analysis only with your consent.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/signup">Start your wellness assessment</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">Sign in</Link>
            </Button>
          </div>

        </div>
      </div>
    </main>
  );
}
