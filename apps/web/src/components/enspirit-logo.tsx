import Image from 'next/image';

import { cn } from '@/lib/utils';

const LOGO_ASPECT_RATIO = 140 / 32;

export function EnspiritLogo({
  className,
  width,
  height = 16,
}: {
  className?: string;
  /** Takes precedence over height when set — height is derived from it to keep the logo's aspect ratio. */
  width?: number;
  height?: number;
}) {
  const resolvedWidth = width ?? Math.round(height * LOGO_ASPECT_RATIO);
  const resolvedHeight = width ? Math.round(width / LOGO_ASPECT_RATIO) : height;
  return (
    <Image
      src="/enspirit-logo.svg"
      alt="Enspirit"
      width={resolvedWidth}
      height={resolvedHeight}
      // `shrink-0` is load-bearing: as a flex child the mark would otherwise be
      // compressed horizontally by flex-shrink while its height attribute held,
      // squashing the wordmark into a distorted blob. `h-auto` keeps the ratio
      // intact if a caller ever constrains the width instead.
      className={cn('h-auto shrink-0', className)}
    />
  );
}
