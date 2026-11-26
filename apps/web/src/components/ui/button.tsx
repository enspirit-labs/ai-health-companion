import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all cursor-pointer disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
        destructive:
          'bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90',
        // `text-foreground` is explicit rather than relied-upon-inherited: some
        // callers (e.g. the mobile camera capture controls) sit inside an
        // ancestor that sets `text-white` for other buttons in the same group,
        // which made this variant's text unreadable against its own light
        // `bg-background`.
        outline: 'border border-input bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      // The `coarse:` bumps clear the 44px minimum from WCAG 2.5.5 / the iOS
      // HIG on touch devices. Keyed to `pointer: coarse` rather than a width
      // breakpoint so desktop keeps its denser spacing while a wide touch
      // tablet still gets full-size targets.
      size: {
        default: 'h-9 px-4 py-2 coarse:h-11',
        sm: 'h-8 px-3 text-xs coarse:h-10 coarse:px-4',
        lg: 'h-10 px-6 coarse:h-12',
        icon: 'size-9 coarse:size-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
