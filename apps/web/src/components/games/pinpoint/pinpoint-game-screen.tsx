'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Lightbulb } from 'lucide-react';
import {
  isPinpointGuessCorrect,
  pinpointAnswerShape,
  pinpointMatchPercent,
  type PinpointGame,
} from '@aidoctor/shared';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLogPulseGameCompleted } from '@/lib/dashboard/use-dashboard';
import { cn } from '@/lib/utils';
import { GameCompletion } from '../game-completion';
import { GameFeedback } from '../game-feedback';
import { GameShell, useGameTimer } from '../game-shell';
import { HintPanel } from '../hint-panel';

const RULES = [
  'All the clues belong to one common category.',
  'Guess the category in as few clue reveals as possible.',
  'Each wrong guess reveals the next clue, so a miss still moves you forward.',
  'Close wording counts — you do not have to match the phrasing exactly.',
  'Stuck? A hint reveals the shape of the answer before giving anything away.',
];

interface Attempt {
  guess: string;
  matchPercent: number;
}

/** Thin-spaces a letter mask so "W····" reads as four blanks, not a squiggle. */
function spaced(mask: string): string {
  return mask.split('').join(' ');
}

export function PinpointGameScreen({
  game,
  difficulty,
}: {
  game: PinpointGame;
  difficulty: 'EASY' | 'STANDARD';
}) {
  const totalClues = game.clues.length;
  const [revealedCount, setRevealedCount] = useState(1);
  const [guess, setGuess] = useState('');
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [solved, setSolved] = useState(false);
  const [outOfGuesses, setOutOfGuesses] = useState(false);
  const [hintText, setHintText] = useState<string | null>(null);
  const [hintsUsed, setHintsUsed] = useState(0);

  const shape = useMemo(() => pinpointAnswerShape(game.theme), [game.theme]);
  const finished = solved || outOfGuesses;
  const elapsedMs = useGameTimer(!finished);
  const logCompleted = useLogPulseGameCompleted();
  const hasLogged = useRef(false);

  useEffect(() => {
    if (!solved || hasLogged.current) return;
    hasLogged.current = true;
    logCompleted.mutate({
      gameType: 'PINPOINT',
      durationMs: elapsedMs,
      hintsUsed,
      guessesUsed: attempts.length + 1,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solved]);

  const lastAttempt = attempts[attempts.length - 1] ?? null;

  function submitGuess(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = guess.trim();
    if (!trimmed || finished) return;

    if (isPinpointGuessCorrect(trimmed, game.theme)) {
      setSolved(true);
      setRevealedCount(totalClues); // reveal the full set so the connection is visible
      setGuess('');
      return;
    }

    const attempt: Attempt = { guess: trimmed, matchPercent: pinpointMatchPercent(trimmed, game.theme) };
    const nextAttempts = [...attempts, attempt];
    setAttempts(nextAttempts);
    setGuess('');
    setHintText(null);

    if (revealedCount < totalClues) {
      setRevealedCount((count) => count + 1);
    } else {
      // Every clue is already out and this guess missed — end the round rather
      // than letting the player grind indefinitely against a revealed board.
      setOutOfGuesses(true);
    }
  }

  /**
   * Escalating help, weakest first, never the answer outright:
   *  1. how long the answer is and how it starts
   *  2. a free clue reveal that doesn't cost a guess
   *  3. (only once every clue is out) the full letter skeleton
   *
   * Tier 1 deliberately shows just the first word's shape — spelling out every
   * initial of a phrase like "Words that come before fall" would effectively be
   * the answer, which is the opposite of a hint.
   */
  function requestHint() {
    setHintsUsed((count) => count + 1);

    if (hintsUsed === 0) {
      const plural = shape.wordCount === 1 ? '' : 's';
      setHintText(
        `The answer is ${shape.wordCount} word${plural}, and the first one looks like ${spaced(shape.masked[0])} (each dot is a letter).`,
      );
      return;
    }

    if (revealedCount < totalClues) {
      setRevealedCount((count) => count + 1);
      setHintText("Here's another clue, free of charge — that one didn't cost you a guess.");
      return;
    }

    setHintText(
      `Every clue is showing, so here's the whole shape: ${shape.masked.map(spaced).join('   ')}`,
    );
  }

  const cluesShown = game.clues.slice(0, revealedCount);

  const board = (
    <div className="w-full max-w-sm">
      <div className="overflow-hidden rounded-xl border shadow-sm">
        {game.clues.map((clue, i) => {
          const revealed = i < revealedCount;
          // Lightest at the top, deepening downward like Pinpoint's own stack —
          // it makes "how far down am I" readable at a glance.
          const depth = totalClues > 1 ? 1 - i / (totalClues - 1) : 1;
          return (
            <div
              key={i}
              className={cn(
                'flex items-center justify-center px-4 py-3.5 text-center text-sm font-semibold transition-all duration-300',
                i > 0 && 'border-t',
                revealed ? 'text-primary-foreground' : 'text-muted-foreground',
              )}
              style={
                revealed
                  ? { backgroundColor: `color-mix(in oklab, var(--primary) ${45 + depth * 45}%, black)` }
                  : undefined
              }
            >
              {revealed ? (
                <span className="animate-in fade-in zoom-in-95 duration-300">{clue}</span>
              ) : (
                <span className="text-xs uppercase tracking-wide">Clue {i + 1}</span>
              )}
            </div>
          );
        })}

        {solved ? (
          <div className="flex items-center justify-center gap-2 border-t bg-status-good/10 px-4 py-3 text-sm font-semibold animate-in fade-in duration-300">
            <Check className="size-4 shrink-0 text-status-good" aria-hidden="true" />
            <span>{game.theme}</span>
          </div>
        ) : null}
      </div>

      {attempts.length > 0 ? (
        <ul className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
          {attempts.map((attempt, i) => (
            <li
              key={i}
              className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground"
            >
              <s>{attempt.guess}</s>
              <span className="tabular-nums opacity-70">{attempt.matchPercent}%</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );

  if (finished) {
    return (
      <GameShell
        title="Pinpoint"
        tagline={solved ? 'You found the connection' : 'Out of guesses'}
        difficulty={difficulty}
        elapsedMs={elapsedMs}
        timerRunning={false}
        rules={RULES}
      >
        {board}
        {solved ? (
          <GameCompletion
            title="You pinpointed it."
            gameLabel="Pinpoint"
            elapsedMs={elapsedMs}
            hintsUsed={hintsUsed}
            extraStats={[{ label: 'Guesses', value: String(attempts.length + 1) }]}
          />
        ) : (
          <div className="flex w-full flex-col gap-3">
            <GameFeedback tone="warning" message={`Today's category was "${game.theme}".`} />
            <Button asChild variant="outline" className="self-center">
              <a href="/dashboard">Back to dashboard</a>
            </Button>
          </div>
        )}
      </GameShell>
    );
  }

  return (
    <GameShell
      title="Pinpoint"
      tagline="Guess the category from the clues"
      difficulty={difficulty}
      elapsedMs={elapsedMs}
      timerRunning
      rules={RULES}
      actions={
        <Button variant="outline" size="sm" onClick={requestHint}>
          <Lightbulb className="size-3.5" aria-hidden="true" />
          Hint
        </Button>
      }
      feedback={
        <div className="flex flex-col gap-3">
          {hintText ? <HintPanel reason={hintText} onDismiss={() => setHintText(null)} /> : null}
          {lastAttempt && !hintText ? (
            <GameFeedback
              tone="warning"
              message={
                lastAttempt.matchPercent >= 50
                  ? `"${lastAttempt.guess}" was close (${lastAttempt.matchPercent}% match) — you're on the right track. Another clue is showing.`
                  : `"${lastAttempt.guess}" wasn't it (${lastAttempt.matchPercent}% match). Another clue is showing.`
              }
            />
          ) : null}
        </div>
      }
    >
      {board}

      <form onSubmit={submitGuess} className="flex w-full max-w-sm flex-col gap-2">
        <div className="flex items-center gap-2">
          <Input
            value={guess}
            onChange={(event) => setGuess(event.target.value)}
            placeholder="Guess the category…"
            aria-label="Guess the category"
            autoComplete="off"
          />
          <Button type="submit" disabled={!guess.trim()}>
            Guess
          </Button>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          {cluesShown.length} of {totalClues} clues revealed
        </p>
      </form>
    </GameShell>
  );
}
