'use client';

import { ClipboardList, Clock, Lock } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useCurrentUser } from '@/lib/auth/use-auth';

/**
 * The first screen a brand-new user sees right after signup — this owns the
 * whole "welcome" moment (heading included) rather than sitting under the
 * standard PageHeader, so page.tsx skips that header while this is showing.
 * The profile as a whole isn't skippable (unlike ConsentGate), only
 * individual fields are, so there's a single CTA rather than an opt-out.
 */
export function HealthProfileIntroCard({ onContinue }: { onContinue: () => void }) {
  const { data: user } = useCurrentUser();
  const firstName = user?.fullName.split(' ')[0];

  return (
    <Card className="stripe-top w-full max-w-lg overflow-hidden">
      <CardContent className="flex flex-col items-center gap-6 px-6 pt-8 pb-8 text-center sm:px-10">
        <div className="flex size-14 items-center justify-center rounded-full bg-accent">
          <ClipboardList aria-hidden="true" className="size-7 text-accent-foreground" />
        </div>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-medium">Welcome{firstName ? `, ${firstName}` : ''}</h1>
          <p className="text-sm text-muted-foreground">
            Let&apos;s build your health profile to personalize your results.
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden="true" />
            ~2 min
          </span>
          <span className="flex items-center gap-1">
            <Lock className="size-3.5" aria-hidden="true" />
            Private &amp; skippable
          </span>
        </div>
        <Button size="lg" onClick={onContinue}>
          Let&apos;s get started
        </Button>
      </CardContent>
    </Card>
  );
}
