'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';
import { isNavLinkActive, NAV_LINKS } from '@/lib/nav-links';

/**
 * Primary navigation on compact viewports. The desktop header's nav is
 * `hidden md:flex`, which previously left phones with NO route to Assessments,
 * Reports or Recommendations — this is that missing surface.
 *
 * `sticky bottom-0`, not `fixed`, and that distinction matters: the compliance
 * footer is rendered by the ROOT layout, i.e. after this component's subtree in
 * document order. A fixed bar would sit permanently on top of it. Sticky pins
 * the bar to the bottom of the viewport while the page scrolls, then lets it
 * settle into its natural place above the footer once the document end is
 * reached — so the footer stays readable and no padding-offset hack is needed.
 */
export function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="sticky bottom-0 z-40 border-t bg-background/95 backdrop-blur-sm md:hidden"
    >
      <ul className="grid grid-cols-4">
        {NAV_LINKS.map((link) => {
          const isActive = isNavLinkActive(pathname, link.href);
          const Icon = link.icon;
          return (
            <li key={link.href} className="min-w-0">
              <Link
                href={link.href}
                // The visible label is abbreviated to fit a quarter of a 320px
                // viewport, so aria-label carries the full destination name for
                // assistive tech. It must be aria-label rather than a visible
                // short label plus an `sr-only` full one: the accessible name is
                // then computed from contents and concatenates the two into
                // "GuidanceRecommendations".
                aria-label={link.label}
                // aria-current is what tells a screen reader which tab you're
                // on; the color change alone conveys it to sighted users only.
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'pb-safe flex min-h-14 flex-col items-center justify-center gap-1 px-1 pt-2 text-center transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-5 shrink-0" aria-hidden="true" />
                <span aria-hidden="true" className="w-full truncate text-[0.6875rem] leading-none font-medium">
                  {link.shortLabel}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
