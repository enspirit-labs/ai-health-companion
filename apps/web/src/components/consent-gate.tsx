'use client';

import { Camera, Mic } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingState } from '@/components/loading-state';
import { useCurrentUser } from '@/lib/auth/use-auth';
import { useUpdateConsent } from '@/lib/consent/use-consent';

const COPY = {
  CAMERA: {
    icon: Camera,
    title: 'Camera access needed',
    description:
      'This assessment analyzes a photo captured with your camera — nothing is saved unless you submit it.',
  },
  MICROPHONE: {
    icon: Mic,
    title: 'Microphone access needed',
    description:
      'This assessment analyzes your voice from a short recording — nothing is saved unless you submit it.',
  },
} as const;

export function ConsentGate({
  type,
  description: descriptionOverride,
  children,
}: {
  type: 'CAMERA' | 'MICROPHONE';
  /** Overrides the default "photo"/"recording" copy for capture modes that don't
   * match it (e.g. a live pose-tracked test that never uploads anything, or a
   * video capture that uploads extracted frames rather than a single photo). */
  description?: string;
  children: React.ReactNode;
}) {
  const { data: user, isLoading } = useCurrentUser();
  const updateConsent = useUpdateConsent();
  const { icon: Icon, title, description: defaultDescription } = COPY[type];
  const description = descriptionOverride ?? defaultDescription;

  if (isLoading || !user) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <LoadingState label="Loading…" />
      </div>
    );
  }

  const hasConsent = type === 'CAMERA' ? user.consentCamera : user.consentMicrophone;
  if (hasConsent) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="flex flex-col items-center text-center">
          <Icon aria-hidden="true" className="size-10 text-primary" />
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          <div className="flex gap-3">
            <Button
              variant="outline"
              disabled={updateConsent.isPending}
              onClick={() => updateConsent.mutate({ type, granted: false })}
            >
              Not now
            </Button>
            <Button
              disabled={updateConsent.isPending}
              onClick={() => updateConsent.mutate({ type, granted: true })}
            >
              Allow {type === 'CAMERA' ? 'camera' : 'microphone'} access
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Skip anytime — we&apos;ll score you on the assessments you complete.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
