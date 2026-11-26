'use client';

import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Props {
  isSubmitting: boolean;
  onComplete: (label: string) => void;
}

const SLOAN_LETTERS = ['C', 'D', 'H', 'K', 'N', 'O', 'R', 'S', 'V', 'Z'];

// Contrast expressed as letter opacity against a fixed neutral plate —
// deliberately styled inline so the result doesn't depend on light/dark theme.
const CONTRAST_LEVELS = [1, 0.75, 0.55, 0.4, 0.28, 0.18, 0.1];

function labelForDeepestLevel(index: number): string {
  if (index >= 5) return 'Excellent';
  if (index >= 3) return 'Normal';
  if (index >= 1) return 'Mild reduction';
  return 'Reduced';
}

export function ContrastSensitivityTest({ isSubmitting, onComplete }: Props) {
  const [levelIndex, setLevelIndex] = useState(0);
  const [deepestCorrect, setDeepestCorrect] = useState(-1);
  const [guess, setGuess] = useState('');
  const target = useMemo(() => SLOAN_LETTERS[Math.floor(Math.random() * SLOAN_LETTERS.length)], [levelIndex]);

  const contrast = CONTRAST_LEVELS[levelIndex];

  function handleAnswer(correct: boolean) {
    if (correct) {
      const newDeepest = levelIndex;
      if (levelIndex === CONTRAST_LEVELS.length - 1) {
        onComplete(labelForDeepestLevel(newDeepest));
        return;
      }
      setDeepestCorrect(newDeepest);
      setLevelIndex((i) => i + 1);
      setGuess('');
    } else {
      onComplete(labelForDeepestLevel(deepestCorrect));
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border px-6 py-8 text-center">
      <p className="text-sm font-medium">Contrast sensitivity check</p>
      <p className="max-w-xs text-xs text-muted-foreground">
        The letter below will get fainter each round. Type what you see for as long as you can.
      </p>
      <div
        className="flex h-28 w-full max-w-xs items-center justify-center rounded-xl"
        style={{ backgroundColor: '#e2e2e2' }}
      >
        <span
          className="select-none font-mono text-6xl font-bold"
          style={{ color: `rgba(20, 20, 20, ${contrast})` }}
          data-testid="contrast-letter"
        >
          {target}
        </span>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          handleAnswer(guess.trim().toUpperCase() === target);
        }}
      >
        <Input
          autoFocus
          value={guess}
          onChange={(e) => setGuess(e.target.value)}
          maxLength={1}
          className="max-w-20 text-center uppercase"
          placeholder="A"
        />
        <Button type="submit" disabled={!guess.trim() || isSubmitting}>
          Check
        </Button>
      </form>
      <Button type="button" variant="ghost" size="sm" disabled={isSubmitting} onClick={() => handleAnswer(false)}>
        Can&apos;t see it
      </Button>
    </div>
  );
}
