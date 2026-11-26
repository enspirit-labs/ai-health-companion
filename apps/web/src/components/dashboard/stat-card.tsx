import Link from 'next/link';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function StatCard({
  label,
  score,
  size = 'default',
  className,
  href,
}: {
  label: string;
  score: number | null;
  size?: 'default' | 'lg';
  className?: string;
  href?: string;
}) {
  const content = (
    <CardContent className="px-5 py-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      {score === null ? (
        <p className="mt-1 text-2xl font-semibold text-muted-foreground/50">—</p>
      ) : (
        <p className={cn('mt-1 font-semibold tabular-nums', size === 'lg' ? 'text-5xl' : 'text-2xl')}>
          {Math.round(score)}
          <span className="text-base font-normal text-muted-foreground">/100</span>
        </p>
      )}
    </CardContent>
  );

  if (!href) {
    return <Card className={cn('gap-2', className)}>{content}</Card>;
  }

  return (
    <Link href={href} aria-label={label} className="block">
      <Card className={cn('gap-2 transition-colors hover:bg-accent/50', className)}>{content}</Card>
    </Link>
  );
}
