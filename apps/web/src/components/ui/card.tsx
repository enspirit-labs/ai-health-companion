import * as React from 'react';

import { cn } from '@/lib/utils';

function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn(
        'bg-card text-card-foreground flex flex-col gap-6 rounded-xl border shadow-sm',
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        // Single column below sm so CardAction drops BELOW the title instead of
        // sitting beside it — at 320px an inline "View all" squeezed titles like
        // "Assessment history" into three wrapped lines.
        //
        // The 2-column track is scoped to `has-data-[slot=card-action]` — NOT
        // applied unconditionally — because a header with just a title and
        // description (e.g. the login/signup card) has no CardAction to fill
        // the second column. Without this guard, CardTitle and CardDescription
        // become sibling grid items with nowhere else to go: with a real
        // 2-column explicit grid, the auto-placement algorithm fills column 2
        // in the same row instead of wrapping down, splitting "Welcome back"
        // and "Sign in to continue..." onto the same line. `grid-cols-1` alone
        // (0 or 1 explicit columns) always wraps auto-placed siblings onto a
        // new row, which is what keeps title/description stacked here.
        '@container/card-header grid auto-rows-min grid-rows-[auto_auto] grid-cols-1 items-start gap-1.5 px-4 pt-6 sm:px-6 sm:has-data-[slot=card-action]:grid-cols-[1fr_auto]',
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="card-title" className={cn('leading-none font-medium', className)} {...props} />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="card-description" className={cn('text-muted-foreground text-sm', className)} {...props} />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        'row-start-3 col-start-1 self-start justify-self-start -ml-3',
        'sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:ml-0 sm:justify-self-end',
        className,
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  // pb-6 by default: CardContent is the last element in most cards (no
  // CardFooter), so without it content sits flush against the card's bottom
  // edge. A caller adding a CardFooter after this, or its own vertical
  // padding (e.g. py-4), overrides it via cn()'s tailwind-merge.
  // px-4 below sm: at 320px the page's own px-4 plus a card px-6 consumed 40px
  // of 320, leaving grids and long labels nowhere to go.
  return <div data-slot="card-content" className={cn('px-4 pb-6 sm:px-6', className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center px-4 pb-6 sm:px-6 [.border-t]:pt-6', className)}
      {...props}
    />
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
