import type { AiObservation } from '@aidoctor/shared';

import { RiskLevelBadge } from '@/components/risk-level-badge';
import { humanizeLabel } from '@/lib/utils';

/**
 * A label/value grid rather than a flex-justify-between row: fixed columns
 * keep every row aligned regardless of how long a given label or value is,
 * instead of each row drifting independently.
 */
export function ObservationsList({ observations }: { observations: AiObservation[] }) {
  if (observations.length === 0) return null;

  return (
    <dl className="divide-y divide-border overflow-hidden rounded-lg border">
      {observations.map((obs, i) => (
        <div
          key={i}
          className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[180px_1fr] sm:items-center sm:gap-4"
        >
          <dt className="text-sm text-muted-foreground">{humanizeLabel(obs.label)}</dt>
          <dd className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <span>{obs.value}</span>
            {obs.severity ? <RiskLevelBadge riskLevel={obs.severity} className="text-[11px]" /> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
