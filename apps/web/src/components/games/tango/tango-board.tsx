'use client';

import { Moon, Sun } from 'lucide-react';
import type { TangoConstraint } from '@aidoctor/shared';
import type { Coord, TangoCell, TangoGrid } from '@aidoctor/shared';

import { cn } from '@/lib/utils';

const CELL_LABEL: Record<TangoCell, string> = { EMPTY: 'empty', SUN: 'sun', MOON: 'moon' };

function key(r: number, c: number) {
  return `${r},${c}`;
}

interface TangoBoardProps {
  cells: TangoGrid;
  /** True where the puzzle supplied the value — locked, not editable. */
  givenMask: boolean[][];
  constraints: TangoConstraint[];
  size: number;
  /** "r,c" keys currently breaking a rule — rendered with the hatch overlay. */
  violatingKeys: Set<string>;
  /** Cell the active hint points at, highlighted until applied or dismissed. */
  hintTarget?: Coord | null;
  /** Cells that justify the active hint, highlighted more subtly than the target. */
  hintBecause?: Coord[];
  solved: boolean;
  onToggle: (row: number, col: number) => void;
  /** One-shot sweep played across the finished board before the completion card appears. */
  shimmer?: boolean;
}

/**
 * Continuous bordered grid (no gaps) so the =/× clues can sit exactly on the
 * shared edge between two cells, positioned as percentages — which keeps the
 * markers aligned at any board size as the grid scales down on mobile.
 */
export function TangoBoard({
  cells,
  givenMask,
  constraints,
  size,
  violatingKeys,
  hintTarget,
  hintBecause = [],
  solved,
  onToggle,
  shimmer = false,
}: TangoBoardProps) {
  const becauseKeys = new Set(hintBecause.map(([r, c]) => key(r, c)));
  const targetKey = hintTarget ? key(hintTarget[0], hintTarget[1]) : null;

  return (
    <div
      className={cn(
        'relative w-full max-w-[min(86vw,24rem)] overflow-hidden rounded-xl border-2 bg-card shadow-sm',
        shimmer && 'board-shimmer',
      )}
      style={{ aspectRatio: '1 / 1' }}
    >
      <div
        className="grid h-full w-full"
        style={{
          gridTemplateColumns: `repeat(${size}, 1fr)`,
          // Rows default to auto-sizing on content, which lets a row holding
          // fewer icons render a hair shorter than its neighbors — pin every
          // row to an equal fraction so all six stay the same height.
          gridTemplateRows: `repeat(${size}, 1fr)`,
        }}
      >
        {cells.map((row, r) =>
          row.map((cell, c) => {
            const cellKey = key(r, c);
            const isGiven = givenMask[r][c];
            const isViolating = violatingKeys.has(cellKey);
            const isHintTarget = targetKey === cellKey;
            const isHintBecause = becauseKeys.has(cellKey);

            return (
              <button
                key={cellKey}
                type="button"
                disabled={isGiven || solved}
                aria-label={`Row ${r + 1}, column ${c + 1}: ${CELL_LABEL[cell]}${isGiven ? ', locked' : ''}`}
                aria-invalid={isViolating || undefined}
                onClick={() => onToggle(r, c)}
                className={cn(
                  'relative flex items-center justify-center transition-colors duration-150',
                  // Internal grid lines only — the container supplies the outer edge.
                  c < size - 1 && 'border-r',
                  r < size - 1 && 'border-b',
                  isGiven ? 'bg-muted' : 'bg-card',
                  !isGiven && !solved && 'cursor-pointer hover:bg-accent active:bg-accent/80',
                  isGiven && !solved && 'cursor-not-allowed',
                  isHintTarget && 'ring-2 ring-inset ring-primary',
                  isHintBecause && 'bg-primary/10',
                )}
              >
                {isViolating ? (
                  // Diagonal hatch marks the exact offending cells, matching how
                  // LinkedIn shows a broken rule without blocking further input.
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 animate-in fade-in duration-200"
                    style={{
                      background:
                        'repeating-linear-gradient(45deg, var(--tango-violation) 0 4px, transparent 4px 9px)',
                    }}
                  />
                ) : null}

                {cell === 'SUN' ? (
                  <Sun
                    className={cn(
                      'relative h-[52%] w-[52%] animate-in zoom-in-50 duration-150',
                      isGiven ? 'text-foreground/70' : 'text-[var(--tango-sun)]',
                    )}
                    strokeWidth={2.25}
                    aria-hidden="true"
                  />
                ) : cell === 'MOON' ? (
                  <Moon
                    className={cn(
                      'relative h-[48%] w-[48%] animate-in zoom-in-50 duration-150',
                      isGiven ? 'text-foreground/70' : 'text-[var(--tango-moon)]',
                    )}
                    strokeWidth={2.25}
                    aria-hidden="true"
                  />
                ) : null}
              </button>
            );
          }),
        )}
      </div>

      {constraints.map((constraint, i) => {
        const [ar, ac] = constraint.a;
        const [br, bc] = constraint.b;
        const isHorizontal = ar === br;
        // Sits on the boundary the pair shares: the higher index is the edge.
        const leftPct = isHorizontal ? (Math.max(ac, bc) / size) * 100 : ((ac + 0.5) / size) * 100;
        const topPct = isHorizontal ? ((ar + 0.5) / size) * 100 : (Math.max(ar, br) / size) * 100;

        return (
          <span
            key={i}
            aria-hidden="true"
            className="pointer-events-none absolute flex size-[18px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-background text-[11px] font-bold leading-none text-foreground"
            style={{ left: `${leftPct}%`, top: `${topPct}%` }}
          >
            {constraint.type === 'EQUAL' ? '=' : '×'}
          </span>
        );
      })}

      {/* Constraint clues are decorative above, so state them once for screen readers. */}
      <p className="sr-only">
        {constraints.length === 0
          ? 'This puzzle has no equals or cross clues.'
          : constraints
              .map(
                (constraint) =>
                  `Row ${constraint.a[0] + 1} column ${constraint.a[1] + 1} and row ${constraint.b[0] + 1} column ${constraint.b[1] + 1} must ${constraint.type === 'EQUAL' ? 'match' : 'differ'}.`,
              )
              .join(' ')}
      </p>
    </div>
  );
}
