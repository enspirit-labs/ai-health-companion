import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  icon: Icon,
  backHref,
  backLabel = 'Dashboard',
  actions,
  description,
  titleAs = 'h1',
  className,
}: {
  title: string;
  /** e.g. the assessment type's icon from ASSESSMENT_ICONS — omit for pages with no natural icon. */
  icon?: LucideIcon;
  /** Renders a ghost back button linking here. Omit to hide. */
  backHref?: string;
  backLabel?: string;
  /** Right-aligned slot, e.g. header action buttons. */
  actions?: ReactNode;
  description?: ReactNode;
  titleAs?: 'h1' | 'h2';
  className?: string;
}) {
  const Title = titleAs;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {backHref ? (
        <Button asChild variant="ghost" size="sm" className="w-fit">
          <Link href={backHref}>
            <ArrowLeft className="size-4" /> {backLabel}
          </Link>
        </Button>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* min-w-0 lets a long title wrap instead of pushing `actions` off-screen. The icon
            only pairs with the title row (items-center) — nesting the description inside that
            same row would force the icon to center against the whole two-line block instead
            of just the title text, so it renders as its own line below. */}
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2.5">
            {Icon ? <Icon className="size-6 shrink-0 text-primary" aria-hidden="true" /> : null}
            <Title className="min-w-0 text-xl font-medium">{title}</Title>
          </div>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
