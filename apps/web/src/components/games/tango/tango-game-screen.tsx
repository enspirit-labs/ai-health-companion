'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Lightbulb, RotateCcw, Undo2 } from 'lucide-react';
import {
  isTangoSolved,
  nextTangoHint,
  validateTangoGrid,
  violatingCellKeys,
  type TangoGame,
  type TangoGrid,
  type TangoHint,
} from '@aidoctor/shared';

import { Button } from '@/components/ui/button';
import { useLogPulseGameCompleted } from '@/lib/dashboard/use-dashboard';
import { GameCompletion } from '../game-completion';
import { GameShell, useGameTimer } from '../game-shell';
import { GameFeedback } from '../game-feedback';
import { HintPanel } from '../hint-panel';
import { TangoBoard } from './tango-board';

const NEXT_VALUE = { EMPTY: 'SUN', SUN: 'MOON', MOON: 'EMPTY' } as const;

// A mistake banner appearing the instant a cell is tapped reads as punishment
// for still being mid-thought; giving the player a beat to self-correct
// before flagging it feels more like a nudge.
const MISTAKE_FEEDBACK_DELAY_MS = 1500;
// How long the finished board shimmers before the completion card replaces it.
const SOLVE_SHIMMER_MS = 900;

const RULES = [
  'Fill every cell with either a sun or a moon.',
  'No more than 2 suns or moons may sit next to each other, across or down.',
  'Each row and column must end up with the same number of suns and moons.',
  'Cells joined by = must match. Cells joined by × must be opposite.',
  'Every puzzle has exactly one solution — you never have to guess.',
];

export function TangoGameScreen({ game, difficulty }: { game: TangoGame; difficulty: 'EASY' | 'STANDARD' }) {
  const givenMask = useMemo(
    () => game.grid.map((row) => row.map((cell) => cell !== 'EMPTY')),
    [game.grid],
  );

  const [cells, setCells] = useState<TangoGrid>(() => game.grid.map((row) => [...row]));
  const [history, setHistory] = useState<TangoGrid[]>([]);
  const [hint, setHint] = useState<TangoHint | null>(null);
  const [hintsUsed, setHintsUsed] = useState(0);

  const violations = useMemo(
    () => validateTangoGrid(cells, game.constraints, game.size),
    [cells, game.constraints, game.size],
  );
  const solved = useMemo(
    () => isTangoSolved(cells, game.constraints, game.size),
    [cells, game.constraints, game.size],
  );

  const elapsedMs = useGameTimer(!solved);
  const logCompleted = useLogPulseGameCompleted();
  const hasLogged = useRef(false);

  useEffect(() => {
    if (!solved || hasLogged.current) return;
    hasLogged.current = true;
    logCompleted.mutate({ gameType: 'TANGO', durationMs: elapsedMs, hintsUsed });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solved]);

  // Let the finished board shimmer for a beat before swapping in the
  // completion card, instead of cutting to it the instant the last cell lands.
  const [showCompletion, setShowCompletion] = useState(false);
  useEffect(() => {
    if (!solved) {
      setShowCompletion(false);
      return;
    }
    const id = setTimeout(() => setShowCompletion(true), SOLVE_SHIMMER_MS);
    return () => clearTimeout(id);
  }, [solved]);

  function commit(next: TangoGrid) {
    setHistory((past) => [...past, cells.map((row) => [...row])]);
    setCells(next);
  }

  function toggleCell(row: number, col: number) {
    if (givenMask[row][col] || solved) return;
    const next = cells.map((r) => [...r]);
    next[row][col] = NEXT_VALUE[cells[row][col]];
    commit(next);
    // Any edit can invalidate the standing hint's premise, so retire it.
    setHint(null);
  }

  function undo() {
    setHistory((past) => {
      if (past.length === 0) return past;
      setCells(past[past.length - 1]);
      setHint(null);
      return past.slice(0, -1);
    });
  }

  function reset() {
    setCells(game.grid.map((row) => [...row]));
    setHistory([]);
    setHint(null);
  }

  function requestHint() {
    const next = nextTangoHint(cells, game.constraints, game.size, game.solution);
    if (!next) return;
    setHint(next);
    setHintsUsed((count) => count + 1);
  }

  /** Places the hinted symbol so the player can carry on from the explanation. */
  function applyHint() {
    if (!hint) return;
    const [r, c] = hint.cell;
    const next = cells.map((row) => [...row]);
    next[r][c] = hint.symbol;
    commit(next);
    setHint(null);
  }

  // Both the cell hatching and the banner below wait for the same delay, so a
  // mistake surfaces as one coherent moment instead of the hatch flashing on
  // instantly while the text lags behind it.
  const [displayedViolations, setDisplayedViolations] = useState<typeof violations>([]);

  useEffect(() => {
    if (violations.length === 0) {
      setDisplayedViolations([]);
      return;
    }
    const id = setTimeout(() => setDisplayedViolations(violations), MISTAKE_FEEDBACK_DELAY_MS);
    return () => clearTimeout(id);
  }, [violations]);

  const displayedViolatingKeys = useMemo(() => violatingCellKeys(displayedViolations), [displayedViolations]);
  // One banner at a time: the first violation is the one to fix. Showing all of
  // them at once (a bad move often trips two rules) reads as punishment.
  const displayedViolation = displayedViolations[0] ?? null;

  if (solved) {
    return (
      <GameShell
        title="Tango"
        tagline={game.title}
        difficulty={difficulty}
        elapsedMs={elapsedMs}
        timerRunning={false}
        rules={RULES}
      >
        <TangoBoard
          cells={cells}
          givenMask={givenMask}
          constraints={game.constraints}
          size={game.size}
          violatingKeys={new Set()}
          solved
          shimmer={!showCompletion}
          onToggle={() => {}}
        />
        {showCompletion ? (
          <GameCompletion
            title="Grid complete — nicely reasoned."
            gameLabel="Tango"
            elapsedMs={elapsedMs}
            hintsUsed={hintsUsed}
          />
        ) : null}
      </GameShell>
    );
  }

  return (
    <GameShell
      title="Tango"
      tagline={game.title}
      difficulty={difficulty}
      elapsedMs={elapsedMs}
      timerRunning
      rules={RULES}
      actions={
        <>
          <Button variant="outline" size="sm" onClick={undo} disabled={history.length === 0}>
            <Undo2 className="size-3.5" aria-hidden="true" />
            Undo
          </Button>
          <Button variant="outline" size="sm" onClick={requestHint}>
            <Lightbulb className="size-3.5" aria-hidden="true" />
            Hint
          </Button>
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Reset
          </Button>
        </>
      }
      feedback={
        <div className="flex flex-col gap-3">
          {hint ? (
            <HintPanel reason={hint.reason} onApply={applyHint} onDismiss={() => setHint(null)} />
          ) : null}
          {displayedViolation ? <GameFeedback tone="error" message={displayedViolation.message} /> : null}
        </div>
      }
    >
      <TangoBoard
        cells={cells}
        givenMask={givenMask}
        constraints={game.constraints}
        size={game.size}
        violatingKeys={displayedViolatingKeys}
        hintTarget={hint?.cell ?? null}
        hintBecause={hint?.because}
        solved={false}
        onToggle={toggleCell}
      />
      <p className="text-center text-xs text-muted-foreground">
        Tap a cell to cycle sun → moon → empty.
      </p>
    </GameShell>
  );
}
