import Link from 'next/link';
import { ASSESSMENT_LABELS } from '@aidoctor/shared';
import type { AssessmentHistoryItem } from '@aidoctor/shared';
import { ClipboardList, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import { RiskLevelBadge } from '@/components/risk-level-badge';
import { ASSESSMENT_ICONS } from '@/lib/assessments/assessment-icons';
import { slugFromAssessmentType } from '@/lib/assessments/type-slug';

export function AssessmentHistoryList({ items }: { items: AssessmentHistoryItem[] }) {
  if (items.length === 0) {
    return <EmptyState icon={ClipboardList} message="No completed assessments yet." />;
  }

  return (
    <ul className="divide-y">
      {items.map((item) => {
        const Icon = ASSESSMENT_ICONS[item.type];
        // A month of Daily Pulse check-ins would otherwise all read as
        // identical "Mental Wellness Questionnaire" rows — label and link a
        // PULSE completion as its own, distinct thing instead.
        const isPulse = item.mode === 'PULSE';
        const label = isPulse ? 'Daily Pulse check-in' : ASSESSMENT_LABELS[item.type];
        const retakeHref = isPulse ? '/assessments/daily-pulse' : `/assessments/${slugFromAssessmentType(item.type)}`;
        // Wrapping is the mobile base; one line from `sm` up.
        //
        // The score+badge+Retake cluster is `shrink-0` — incompressible at any
        // width. The label side compresses instead: `min-w-0` on both ancestor
        // divs lifts the automatic minimum size so the flex item can shrink past
        // its content, and `truncate` makes it spend that compression on an
        // ellipsis rather than growing to a second text line.
        //
        // Below `sm` even a fully-collapsed label side can't sit beside that
        // incompressible cluster (at 320px the page's px-4 and the card's px-4
        // leave ~256px — see CardContent in ui/card.tsx), so the row keeps the
        // wrap that cfae463 added to kill the mobile horizontal scroll.
        //
        // At `sm`+ the row always fits, so `sm:flex-nowrap` pins it to one line.
        // That is where the bug lived: in the ~488px `md:grid-cols-2` dashboard
        // column, wrapping was decided by each side's *max-content* width (which
        // `min-w-0` does not lower), so short labels like "Squats Test" stayed
        // inline while "Mental Wellness Questionnaire" pushed the cluster down.
        return (
        <li
          key={item.id}
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0 sm:flex-nowrap sm:gap-y-0"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium" title={label}>
                {label}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {item.completedAt ? new Date(item.completedAt).toLocaleDateString() : '—'}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {item.score !== null ? (
              <span className="whitespace-nowrap text-sm font-semibold tabular-nums">{Math.round(item.score)}/100</span>
            ) : null}
            {item.riskLevel ? <RiskLevelBadge riskLevel={item.riskLevel} /> : null}
            <Button asChild variant="outline" size="sm">
              <Link href={retakeHref}>
                <RotateCcw className="size-3.5" /> Retake
              </Link>
            </Button>
          </div>
        </li>
        );
      })}
    </ul>
  );
}
