'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingState } from '@/components/loading-state';
import { useCurrentUser } from '@/lib/auth/use-auth';
import { useUpdateConsent } from '@/lib/consent/use-consent';

/**
 * Blocks its children until the user has agreed to send their data to the AI
 * provider. The server enforces this too; this is the friendly
 * front door to that rule.
 *
 * Consent wording below: needs review by the privacy owner.
 */
export function AiConsentGate({
  children,
  onGranted,
  onDismiss,
  dismissHref = '/dashboard',
}: {
  children: React.ReactNode;
  /** Called after the user allows AI analysis (e.g. to resume the action that was blocked). */
  onGranted?: () => void;
  /** "Not now" handler; when omitted, "Not now" links to `dismissHref`. */
  onDismiss?: () => void;
  dismissHref?: string;
}) {
  const { data: user, isLoading } = useCurrentUser();
  const updateConsent = useUpdateConsent();

  if (isLoading || !user) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <LoadingState label="Loading…" />
      </div>
    );
  }

  if (user.consentAiProcessing) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-6">
      <Card className="w-full max-w-lg">
        <CardHeader className="flex flex-col items-center text-center">
          <Sparkles aria-hidden="true" className="size-10 text-primary" />
          <CardTitle>Allow AI analysis?</CardTitle>
          <CardDescription>
            To analyse your results and reply in chat, your answers, photos, voice recordings and chat
            messages are sent to Anthropic (USA), the company that runs our AI. They are used only to
            generate your result or reply. You can withdraw this at any time in{' '}
            <Link href="/settings/privacy" className="text-primary underline underline-offset-4">
              privacy settings
            </Link>
            . See our{' '}
            <Link
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-4"
            >
              privacy policy
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {updateConsent.isError ? (
            <Alert variant="error">We couldn&apos;t save your choice. Please try again.</Alert>
          ) : null}
          <div className="flex gap-3">
            {onDismiss ? (
              <Button variant="outline" onClick={onDismiss} disabled={updateConsent.isPending}>
                Not now
              </Button>
            ) : (
              <Button asChild variant="outline">
                <Link href={dismissHref}>Not now</Link>
              </Button>
            )}
            <Button
              disabled={updateConsent.isPending}
              onClick={() =>
                updateConsent.mutate({ type: 'DATA_PROCESSING', granted: true }, { onSuccess: () => onGranted?.() })
              }
            >
              Allow AI analysis
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            You can still answer questions and capture photos or recordings without allowing this.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
