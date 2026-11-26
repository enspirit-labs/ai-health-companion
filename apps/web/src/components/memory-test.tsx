'use client';

import { useCallback, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  isSubmitting: boolean;
  onComplete: (result: { longestSequence: number; rating: string }) => void;
}

const MAX_SEQUENCE_LENGTH = 10;
const FLASH_MS = 500;
const GAP_MS = 200;

const TILES = [
  { key: 0, className: 'bg-red-400' },
  { key: 1, className: 'bg-blue-400' },
  { key: 2, className: 'bg-green-400' },
  { key: 3, className: 'bg-yellow-400' },
];

function ratingFor(longestSequence: number): string {
  if (longestSequence >= 7) return 'Excellent';
  if (longestSequence >= 5) return 'Good';
  if (longestSequence >= 3) return 'Fair';
  return 'Needs improvement';
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function MemoryTest({ isSubmitting, onComplete }: Props) {
  const [started, setStarted] = useState(false);
  const [sequence, setSequence] = useState<number[]>([]);
  const [userInput, setUserInput] = useState<number[]>([]);
  const [isPlayingBack, setIsPlayingBack] = useState(false);
  const [activeTile, setActiveTile] = useState<number | null>(null);
  const finishedRef = useRef(false);

  const playback = useCallback(async (seq: number[]) => {
    setIsPlayingBack(true);
    for (const tile of seq) {
      setActiveTile(tile);
      await wait(FLASH_MS);
      setActiveTile(null);
      await wait(GAP_MS);
    }
    setIsPlayingBack(false);
  }, []);

  const startNextRound = useCallback(
    async (base: number[]) => {
      const next = [...base, Math.floor(Math.random() * TILES.length)];
      setSequence(next);
      setUserInput([]);
      await playback(next);
    },
    [playback],
  );

  const finish = useCallback(
    (longestSequence: number) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      onComplete({ longestSequence, rating: ratingFor(longestSequence) });
    },
    [onComplete],
  );

  const handleStart = useCallback(() => {
    setStarted(true);
    void startNextRound([]);
  }, [startNextRound]);

  const handleTileClick = useCallback(
    (tileIndex: number) => {
      if (isPlayingBack || isSubmitting) return;

      const position = userInput.length;
      if (sequence[position] !== tileIndex) {
        finish(sequence.length - 1);
        return;
      }

      const nextInput = [...userInput, tileIndex];
      setUserInput(nextInput);

      if (nextInput.length === sequence.length) {
        if (sequence.length >= MAX_SEQUENCE_LENGTH) {
          finish(sequence.length);
          return;
        }
        setTimeout(() => void startNextRound(sequence), 600);
      }
    },
    [isPlayingBack, isSubmitting, userInput, sequence, finish, startNextRound],
  );

  if (!started) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border px-6 py-8 text-center">
        <p className="text-sm font-medium">Memory check</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Watch the pattern light up, then repeat it by tapping the tiles in the same order. The pattern gets
          longer each round.
        </p>
        <Button onClick={handleStart}>Start</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border px-6 py-8 text-center">
      <p className="text-sm font-medium">
        Round {sequence.length}: {isPlayingBack ? 'watch the pattern' : 'your turn'}
      </p>
      <div className="grid grid-cols-2 gap-3">
        {TILES.map((tile) => (
          <button
            key={tile.key}
            type="button"
            aria-label={`Tile ${tile.key + 1}`}
            disabled={isPlayingBack || isSubmitting}
            onClick={() => handleTileClick(tile.key)}
            className={cn(
              'size-24 cursor-pointer rounded-xl transition-opacity disabled:cursor-not-allowed',
              tile.className,
              activeTile === tile.key ? 'opacity-100 ring-4 ring-foreground/40' : 'opacity-50',
            )}
          />
        ))}
      </div>
    </div>
  );
}
