'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HeartPulse, Database, LockKeyhole, LogOut, MessageCircle, ShieldCheck, Target, UserRound } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { isNavLinkActive, NAV_LINKS } from '@/lib/nav-links';
import { useCurrentUser, useLogout, useTimezoneSync } from '@/lib/auth/use-auth';

/**
 * Shared across every authenticated page (see app/(app)/layout.tsx) instead
 * of each page rolling its own — previously only the dashboard had this row,
 * and it scrolled away with the page instead of staying put.
 *
 * Below `md` this row is intentionally minimal (mark + chat + account) because
 * primary navigation moves to MobileTabBar. Everything here must be able to
 * compress: the original version pinned a `shrink-0` full wordmark next to a
 * `whitespace-nowrap` button, which forced the row to 500px and gave the whole
 * app a horizontal scrollbar on a 375px phone.
 */
export function AppHeader() {
  const pathname = usePathname();
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  useTimezoneSync();
  const headerRef = useRef<HTMLElement>(null);

  // Published as a CSS var so anything scrolled to (e.g. StreakCard's
  // `#dailypulse` anchor — see dashboard/page.tsx) can offset for this sticky
  // header via `scroll-margin-top` instead of a hardcoded height that silently
  // goes stale if this row's padding or button sizing ever changes.
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const setHeaderHeightVar = () => {
      document.documentElement.style.setProperty('--header-height', `${header.offsetHeight}px`);
    };
    setHeaderHeightVar();
    const observer = new ResizeObserver(setHeaderHeightVar);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  return (
    <header ref={headerRef} className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-sm">
      <div className="flex w-full min-w-0 items-center gap-3 px-4 py-3 md:gap-6 md:px-6">
        <Link
          href="/dashboard"
          aria-label="AI Health Companion, go to dashboard"
          className="flex min-w-0 items-center gap-2 text-base font-medium md:text-lg"
        >
          <HeartPulse className="size-5 shrink-0 text-primary" aria-hidden="true" />
          {/* Icon-only below md. The wordmark at the app's bumped `text-lg`
              (1.35rem) is ~250px wide, which alone overflows a 320px screen. */}
          <span className="hidden truncate md:inline">AI Health Companion</span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => {
            const isActive = isNavLinkActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex min-w-0 items-center gap-2">
          {/* Icon-only below md — the label is what made this button
              unshrinkable (`whitespace-nowrap` is baked into buttonVariants). */}
          <Button asChild variant="outline" size="sm" className="max-md:size-9 max-md:coarse:size-11 max-md:px-0">
            <Link href="/chat" aria-label="Chat with a Coach">
              <MessageCircle className="size-4" />
              <span className="hidden md:inline">Chat with a Coach</span>
            </Link>
          </Button>

          {/* modal={false}: Radix's default modal mode toggles pointer-events/aria-hidden
              on the document body while open, which iOS Safari mishandles alongside this
              header's `position: sticky` — the header would unstick and only recover on
              the next tap/scroll. This menu doesn't need a hard focus trap, so skipping
              modal mode sidesteps the bug entirely. */}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Account">
                <UserRound className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {user?.role === 'ADMIN' ? (
                <DropdownMenuItem asChild>
                  <Link href="/admin">
                    <ShieldCheck className="size-4" />
                    Admin
                  </Link>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem asChild>
                <Link href="/settings/goals">
                  <Target className="size-4" />
                  My goals
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings/privacy">
                  <LockKeyhole className="size-4" />
                  Privacy settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings/data">
                  <Database className="size-4" />
                  Your data
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                // useLogout does a full reload to /login once the request settles.
                onClick={() => logout.mutate()}
              >
                <LogOut className="size-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
