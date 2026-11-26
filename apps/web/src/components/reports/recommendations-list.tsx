import { Lightbulb } from 'lucide-react';
import type { AiRecommendation } from '@aidoctor/shared';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export const RECOMMENDATION_PRIORITY_CONFIG: Record<
  'HIGH' | 'MEDIUM' | 'LOW',
  { badgeVariant: 'serious' | 'warning' | 'outline'; label: string; border: string; iconWrap: string }
> = {
  HIGH: {
    badgeVariant: 'serious',
    label: 'High priority',
    border: 'border-l-status-serious bg-status-serious/[0.05]',
    iconWrap: 'bg-status-serious/15 text-status-serious',
  },
  MEDIUM: {
    badgeVariant: 'warning',
    label: 'Medium priority',
    border: 'border-l-status-warning bg-status-warning/[0.05]',
    iconWrap: 'bg-status-warning/15 text-[#8a6200] dark:text-status-warning',
  },
  LOW: {
    badgeVariant: 'outline',
    label: 'Low priority',
    border: 'border-l-border',
    iconWrap: 'bg-muted text-muted-foreground',
  },
};

export function RecommendationsList({ recommendations }: { recommendations: AiRecommendation[] }) {
  if (recommendations.length === 0) return null;

  return (
    <ul className="space-y-3">
      {recommendations.map((rec, i) => {
        const config = RECOMMENDATION_PRIORITY_CONFIG[rec.priority];
        return (
          <li key={i} className={cn('flex gap-3 rounded-lg border border-l-[3px] p-4', config.border)}>
            <div className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full', config.iconWrap)}>
              <Lightbulb className="size-4" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">{rec.title}</p>
                <Badge variant={config.badgeVariant}>{config.label}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{rec.detail}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
