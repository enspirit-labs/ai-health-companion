'use client';

import Link from 'next/link';
import { ArrowRight, CheckCircle2, Grid3x3, Puzzle } from 'lucide-react';
import type { PulseGame } from '@aidoctor/shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TechniqueNote } from '@/components/technique-note';
import { GAME_LABELS, GAME_TAGLINES, slugFromGameType } from '@/lib/games/game-slug';

const GAME_ICONS = { TANGO: Grid3x3, PINPOINT: Puzzle } as const;

/**
 * Dashboard-side advert for today's puzzle, not the puzzle itself. The board
 * lives on its own screen (see app/(app)/games/[type]) — a playable grid inside
 * a dashboard card competes with every other card for attention and is
 * unusably small on a phone.
 */
export function PulseGameTeaser({
  game,
  blurb,
  difficulty,
  solvedToday,
}: {
  game: PulseGame;
  blurb: string;
  difficulty: 'EASY' | 'STANDARD';
  solvedToday: boolean;
}) {
  const Icon = GAME_ICONS[game.type];
  const label = GAME_LABELS[game.type];
  const href = `/games/${slugFromGameType(game.type)}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4.5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{label}</p>
            <Badge variant="secondary" className="text-[11px]">
              {difficulty === 'EASY' ? 'Gentle' : 'Standard'}
            </Badge>
            {solvedToday ? (
              <Badge variant="good" className="text-[11px]">
                <CheckCircle2 className="size-3" aria-hidden="true" />
                Solved
              </Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{GAME_TAGLINES[game.type]}</p>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">{blurb}</p>

      <Button asChild className="w-full" variant={solvedToday ? 'outline' : 'default'}>
        <Link href={href}>
          {solvedToday ? 'Play again' : 'Play game'}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </Button>
      <TechniqueNote feature="dailyGames" />
    </div>
  );
}
