import * as React from 'react';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export function FormField({
  label,
  htmlFor,
  error,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const errorId = `${htmlFor}-error`;
  const control = React.isValidElement<{ 'aria-describedby'?: string; 'aria-invalid'?: boolean }>(children)
    ? React.cloneElement(children, {
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? errorId : children.props['aria-describedby'],
      })
    : children;

  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {control}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
