'use client';

import { motion } from 'framer-motion';
import { Phone, TriangleAlert } from 'lucide-react';
import type { EscalationKind } from '@aidoctor/shared';

import { cn } from '@/lib/utils';

interface EmergencyNumber {
  number: string;
  label: string;
}

// Numbers match the fixed copy in @aidoctor/shared (UAE 999 police / 998
// ambulance, 112 across much of Europe, 911 in the US). No other numbers are
// invented here; a mental-health line is deliberately left to "a local crisis line".
// needs clinician review
const NUMBERS: Record<EscalationKind, EmergencyNumber[]> = {
  CRISIS: [
    { number: '999', label: 'UAE police' },
    { number: '998', label: 'UAE ambulance' },
    { number: '112', label: 'Europe' },
    { number: '911', label: 'US' },
  ],
  EMERGENCY: [
    { number: '998', label: 'UAE ambulance' },
    { number: '112', label: 'Europe' },
    { number: '911', label: 'US' },
    { number: '999', label: 'UAE police' },
  ],
};

// needs clinician review
const HEADING: Record<EscalationKind, string> = {
  CRISIS: 'Please reach out for support now',
  EMERGENCY: 'This could be an emergency',
};

/**
 * The fixed escalation message shown as an alert card:
 * the message text, plus tap-to-call links with the numbers as selectable text.
 * It sits in the thread like any assistant turn, so the conversation and the
 * composer stay usable.
 */
export function EscalationCard({
  kind,
  children,
  className,
}: {
  kind: EscalationKind;
  /** The fixed copy, rendered verbatim. */
  children: string;
  className?: string;
}) {
  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'flex w-full flex-col gap-3 rounded-xl border border-destructive/30 border-l-4 border-l-destructive bg-destructive/5 p-4 text-sm text-card-foreground shadow-sm',
        className,
      )}
    >
      <div className="flex items-center gap-2 font-semibold">
        <TriangleAlert className="size-4 shrink-0 text-destructive" aria-hidden="true" />
        <span>{HEADING[kind]}</span>
      </div>
      <p className="whitespace-pre-wrap">{children}</p>
      <ul className="flex flex-wrap gap-2" aria-label="Emergency numbers">
        {NUMBERS[kind].map(({ number, label }) => (
          <li key={number}>
            <a
              href={`tel:${number}`}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-destructive/40 bg-background px-3 py-1 font-medium select-text text-foreground hover:bg-destructive/10 coarse:min-h-11"
            >
              <Phone className="size-3.5 shrink-0" aria-hidden="true" />
              <span>
                {number} <span className="font-normal text-muted-foreground">{label}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}
