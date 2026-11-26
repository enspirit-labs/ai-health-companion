import { CheckCircle2, XCircle } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface RegionChecklistItem {
  key: string;
  label: string;
  confirmed: boolean;
}

/** Pill-badge checklist showing which regions are currently confirmed in
 * frame — green once smoothed detection holds steady, red otherwise (never a
 * neutral "not sure yet" state, so the user always has clear feedback on
 * what to fix). Generic over any region key so it covers both the pose
 * track (head/torso/arms/legs) and the face track (eyes/eyebrows/mouth/jaw). */
export function RegionChecklist({ items }: { items: RegionChecklistItem[] }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {items.map(({ key, label, confirmed }) => (
        <span
          key={key}
          className={cn(
            'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
            confirmed ? 'bg-status-good/10 text-status-good' : 'bg-destructive/10 text-destructive',
          )}
        >
          {confirmed ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
          {label}
        </span>
      ))}
    </div>
  );
}
