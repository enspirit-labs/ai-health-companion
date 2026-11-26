'use client';

import Link from 'next/link';
import { Camera, Mic, ShieldCheck, Sparkles, type LucideIcon } from 'lucide-react';
import type { ConsentType } from '@aidoctor/shared';

import { Alert } from '@/components/ui/alert';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { useCurrentUser } from '@/lib/auth/use-auth';
import { useUpdateConsent } from '@/lib/consent/use-consent';
import { cn } from '@/lib/utils';

// Consent wording: needs review by the privacy owner.
const TOGGLES: {
  type: ConsentType;
  label: string;
  description: string;
  icon: LucideIcon;
  field: 'consentCamera' | 'consentMicrophone' | 'consentAiProcessing';
}[] = [
  {
    type: 'CAMERA',
    label: 'Camera',
    description: 'Lets visual assessments capture photos or short clips with your camera.',
    icon: Camera,
    field: 'consentCamera',
  },
  {
    type: 'MICROPHONE',
    label: 'Microphone',
    description: 'Lets the voice assessment record a short clip with your microphone.',
    icon: Mic,
    field: 'consentMicrophone',
  },
  {
    type: 'DATA_PROCESSING',
    label: 'AI analysis',
    description:
      'Your answers, photos, voice recordings and chat messages are sent to Anthropic (USA) so the AI can analyse them and reply. Turn this off and the AI result and coach chat stop working until you allow it again.',
    icon: Sparkles,
    field: 'consentAiProcessing',
  },
];

export default function PrivacySettingsPage() {
  const { data: user, isLoading } = useCurrentUser();
  const updateConsent = useUpdateConsent();

  return (
    <main id="main-content" className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6">
      <PageHeader
        title="Privacy settings"
        icon={ShieldCheck}
        backHref="/dashboard"
        description="Choose what this app may use. Turning something off takes effect straight away."
      />

      {isLoading ? (
        <LoadingState label="Loading…" />
      ) : !user ? (
        <p className="text-sm text-muted-foreground">
          <Link href="/login" className="text-primary underline underline-offset-4">
            Sign in
          </Link>{' '}
          to manage your privacy settings.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {TOGGLES.map(({ type, label, description, icon: Icon, field }) => {
            const checked = user[field];
            const labelId = `consent-${type}-label`;
            return (
              <li key={type} className="flex items-start gap-3 rounded-xl border bg-card p-4">
                <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p id={labelId} className="text-sm font-medium">
                    {label}
                  </p>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={checked}
                  aria-labelledby={labelId}
                  disabled={updateConsent.isPending}
                  onClick={() => updateConsent.mutate({ type, granted: !checked })}
                  className={cn(
                    'relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
                    checked ? 'border-primary bg-primary' : 'border-input bg-muted',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'inline-block size-4 rounded-full bg-background shadow transition-transform',
                      checked ? 'translate-x-6' : 'translate-x-1',
                    )}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {updateConsent.isError ? (
        <Alert variant="error">We couldn&apos;t save that change. Please try again.</Alert>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Read our{' '}
        <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">
          privacy policy
        </Link>
        .
      </p>
    </main>
  );
}
