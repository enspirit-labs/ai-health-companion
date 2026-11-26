'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { scoreHandCoordinationRounds, type HandCoordinationResult, type RoundLogEntry } from '@/lib/hand-coordination/reaction-scoring';

interface Props {
  isSubmitting: boolean;
  onComplete: (result: HandCoordinationResult) => void;
}

const ROUND_COUNT = 13;
// First 2 rounds are practice — people are typically slower on their very
// first reaction, so these are logged but excluded from scoring.
const PRACTICE_ROUND_COUNT = 2;
const SCORED_ROUND_COUNT = ROUND_COUNT - PRACTICE_ROUND_COUNT;
const TARGET_TIMEOUT_MS = 1500;
const TARGET_SIZE_PX = 56;

export function HandCoordinationTest({ isSubmitting, onComplete }: Props) {
  const areaRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showTimeRef = useRef(0);
  const finishedRef = useRef(false);
  const prevTargetPosRef = useRef<{ x: number; y: number } | null>(null);
  // Distance from the previous target to the one currently on screen —
  // captured at spawn time, read whichever way the round resolves (tap or timeout).
  const pendingDistanceRef = useRef<number | null>(null);

  const [started, setStarted] = useState(false);
  const [round, setRound] = useState(0);
  const [targetPos, setTargetPos] = useState<{ x: number; y: number } | null>(null);
  const [roundLog, setRoundLog] = useState<RoundLogEntry[]>([]);

  const finish = useCallback(
    (log: RoundLogEntry[]) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      onComplete(scoreHandCoordinationRounds(log, TARGET_TIMEOUT_MS));
    },
    [onComplete],
  );

  const spawnTarget = useCallback(() => {
    const area = areaRef.current;
    if (!area) return;
    const { width, height } = area.getBoundingClientRect();
    const next = {
      x: Math.random() * Math.max(width - TARGET_SIZE_PX, 0),
      y: Math.random() * Math.max(height - TARGET_SIZE_PX, 0),
    };
    const prev = prevTargetPosRef.current;
    pendingDistanceRef.current = prev ? Math.hypot(next.x - prev.x, next.y - prev.y) : null;
    prevTargetPosRef.current = next;
    setTargetPos(next);
    showTimeRef.current = performance.now();
  }, []);

  useEffect(() => {
    if (!started) return undefined;
    if (round >= ROUND_COUNT) return undefined;

    spawnTarget();
    timeoutRef.current = setTimeout(() => {
      // Missed — log it and advance without recording a reaction time.
      const entry: RoundLogEntry = {
        isPractice: round < PRACTICE_ROUND_COUNT,
        hit: false,
        reactionMs: null,
        distancePx: pendingDistanceRef.current,
        normalizedReactionMs: null,
      };
      setRoundLog((prev) => [...prev, entry]);
      setTargetPos(null);
      setRound((r) => r + 1);
    }, TARGET_TIMEOUT_MS);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, round]);

  useEffect(() => {
    if (started && round >= ROUND_COUNT) {
      finish(roundLog);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, round]);

  const handleTargetClick = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const reaction = performance.now() - showTimeRef.current;
    const distance = pendingDistanceRef.current;
    const entry: RoundLogEntry = {
      isPractice: round < PRACTICE_ROUND_COUNT,
      hit: true,
      reactionMs: reaction,
      distancePx: distance,
      normalizedReactionMs: distance && distance > 0 ? reaction / distance : null,
    };
    setTargetPos(null);
    setRoundLog((prev) => [...prev, entry]);
    setRound((r) => r + 1);
  }, [round]);

  if (!started) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border px-6 py-8 text-center">
        <p className="text-sm font-medium">Hand coordination check</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          A target will pop up in random spots — tap it as quickly as you can. The first {PRACTICE_ROUND_COUNT} rounds
          are practice; your score is based on the {SCORED_ROUND_COUNT} rounds after that.
        </p>
        <Button onClick={() => setStarted(true)}>Start</Button>
      </div>
    );
  }

  const isPracticeRound = round < PRACTICE_ROUND_COUNT;

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-sm text-muted-foreground">
        Round {Math.min(round + 1, ROUND_COUNT)} of {ROUND_COUNT}
        {isPracticeRound ? ' (practice)' : ''}
      </p>
      <div ref={areaRef} className="relative h-64 w-full max-w-sm overflow-hidden rounded-xl border bg-muted/30">
        {targetPos ? (
          <button
            type="button"
            aria-label="Target"
            disabled={isSubmitting}
            onClick={handleTargetClick}
            className="absolute cursor-pointer rounded-full bg-primary transition-transform hover:scale-105 disabled:cursor-not-allowed"
            style={{ left: targetPos.x, top: targetPos.y, width: TARGET_SIZE_PX, height: TARGET_SIZE_PX }}
          />
        ) : null}
      </div>
    </div>
  );
}
