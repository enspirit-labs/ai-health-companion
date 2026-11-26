'use client';

import { useId, useState } from 'react';
import { Info } from 'lucide-react';

import { cn } from '@/lib/utils';

export type TechniqueFeature = 'streak' | 'goals' | 'weeklyActions' | 'dailyGames' | 'coach';

interface Technique {
  /** Behaviour change technique, named per the BCT Taxonomy v1 (Michie et al., 2013). */
  name: string;
  why: string;
  limits: string;
}

/**
 * Plain-language "why this?" copy for each habit feature: the technique it
 * uses and where it stops helping. Needs clinician review before
 * release — wording is a first draft, not approved health copy.
 */
export const TECHNIQUES: Record<TechniqueFeature, Technique> = {
  streak: {
    name: 'Self-monitoring of behaviour (BCT 2.3)',
    why: 'Seeing a count of the days you checked in makes your own habit easier to notice.',
    limits:
      'A count can start to feel like pressure. Missing a day is normal, so one missed day will not end your streak, and your total active days never reset.',
  },
  goals: {
    name: 'Goal setting (BCT 1.1)',
    why: 'Choosing a small goal for yourself gives your week a clear direction.',
    limits:
      'Goals only help when they feel doable. Too big a goal can be discouraging, so you can change or drop it at any time.',
  },
  weeklyActions: {
    name: 'Action planning (BCT 1.4)',
    why: 'Deciding what you will do, and when, makes it easier to follow through.',
    limits: 'A plan is a starting point, not a test. Plans often need adjusting, and skipping one is fine.',
  },
  dailyGames: {
    name: 'Prompts and cues (BCT 7.1)',
    why: 'A short daily puzzle is a friendly reminder to come back and check in.',
    limits:
      'The games are for fun and a reminder only. They are not a health exercise and do not measure anything about your health.',
  },
  coach: {
    name: 'Instruction on how to perform the behaviour (BCT 4.1)',
    why: 'The coach gives general, practical ideas for everyday habits such as sleep, movement and food.',
    limits:
      'The coach is an AI and can be wrong. It is not medical advice and it does not know your full history. For health concerns, talk to a clinician, and in an emergency call your local emergency number.',
  },
};

/**
 * Collapsed "Why this?" disclosure naming a feature's behaviour change
 * technique and its limits.
 */
export function TechniqueNote({ feature, className }: { feature: TechniqueFeature; className?: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const technique = TECHNIQUES[feature];

  return (
    <div className={cn('text-xs text-muted-foreground', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground"
      >
        <Info className="size-3" aria-hidden="true" />
        Why this?
      </button>
      {open ? (
        <div id={panelId} role="note" className="mt-1.5 space-y-1 rounded-md bg-muted/50 p-2">
          <p>
            <span className="font-medium text-foreground">Technique: </span>
            {technique.name}
          </p>
          <p>{technique.why}</p>
          <p>
            <span className="font-medium text-foreground">Limits: </span>
            {technique.limits}
          </p>
        </div>
      ) : null}
    </div>
  );
}
