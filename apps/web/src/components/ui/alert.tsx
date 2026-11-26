import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

import { cn } from '@/lib/utils';

const alertVariants = cva('flex gap-3 rounded-lg border border-l-4 p-4 text-sm', {
  variants: {
    variant: {
      info: 'border-border border-l-foreground/60 bg-card',
      success: 'border-status-good/25 border-l-status-good bg-status-good/5',
      warning: 'border-status-warning/25 border-l-status-warning bg-status-warning/5',
      error: 'border-destructive/25 border-l-destructive bg-destructive/5',
    },
  },
  defaultVariants: {
    variant: 'info',
  },
});

const ALERT_ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
} as const;

function Alert({
  className,
  variant = 'info',
  title,
  children,
  ...props
}: React.ComponentProps<'div'> &
  VariantProps<typeof alertVariants> & {
    title?: React.ReactNode;
  }) {
  const Icon = ALERT_ICONS[variant ?? 'info'];
  return (
    <div
      data-slot="alert"
      role={variant === 'error' ? 'alert' : 'status'}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="space-y-1">
        {title ? <p className="font-medium text-foreground">{title}</p> : null}
        {children ? <div className="text-muted-foreground">{children}</div> : null}
      </div>
    </div>
  );
}

export { Alert, alertVariants };
