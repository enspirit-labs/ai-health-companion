import { CheckCircle2, Eye, MessageCircleHeart } from 'lucide-react';
import { WELLNESS_SIGNAL_LABELS, type RiskLevel } from '@aidoctor/shared';

import { Badge } from '@/components/ui/badge';

/**
 * Styling for each wellness signal (labels: WELLNESS_SIGNAL_LABELS). A result
 * is never shown as a risk grade or an "abnormal" flag, so no level uses the
 * critical/red variant.
 */
const WELLNESS_SIGNAL_STYLE: Record<RiskLevel, { variant: 'good' | 'warning' | 'serious'; icon: typeof CheckCircle2 }> = {
  LOW: { variant: 'good', icon: CheckCircle2 },
  MODERATE: { variant: 'good', icon: CheckCircle2 },
  ELEVATED: { variant: 'warning', icon: Eye },
  HIGH: { variant: 'serious', icon: MessageCircleHeart },
};

/** Always shown with both an icon and a text label — never color alone. */
export function RiskLevelBadge({ riskLevel, className }: { riskLevel: RiskLevel; className?: string }) {
  const { variant, icon: Icon } = WELLNESS_SIGNAL_STYLE[riskLevel];
  const label = WELLNESS_SIGNAL_LABELS[riskLevel];
  return (
    <Badge variant={variant} className={className}>
      <Icon />
      {label}
    </Badge>
  );
}
