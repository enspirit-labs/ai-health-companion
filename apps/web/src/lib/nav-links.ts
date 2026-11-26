import { ClipboardList, FileText, LayoutDashboard, Sparkles, type LucideIcon } from 'lucide-react';

export interface NavLink {
  href: string;
  /** Used by the desktop header nav, where there's room for the full wording. */
  label: string;
  /**
   * Used by the mobile tab bar, where each tab gets a quarter of the viewport —
   * ~72px of usable width at 320px. "Recommendations" cannot fit there at any
   * legible size, so these are deliberately shorter than `label` rather than
   * truncated with an ellipsis.
   */
  shortLabel: string;
  icon: LucideIcon;
}

/**
 * Single source of truth for primary navigation, consumed by BOTH the desktop
 * header (app-header.tsx) and the mobile tab bar (mobile-tab-bar.tsx). Kept out
 * of either component so the two can never drift apart — the original bug here
 * was that the header's nav was the only definition and it was `hidden md:flex`,
 * which left mobile with no navigation at all.
 */
export const NAV_LINKS: readonly NavLink[] = [
  { href: '/dashboard', label: 'Dashboard', shortLabel: 'Home', icon: LayoutDashboard },
  { href: '/assessments', label: 'Assessments', shortLabel: 'Assess', icon: ClipboardList },
  { href: '/reports', label: 'Reports', shortLabel: 'Reports', icon: FileText },
  // "Guidance" matches the wording the dashboard's recommendations card already
  // uses ("Your top guidance, highest priority first").
  { href: '/recommendations', label: 'Recommendations', shortLabel: 'Guidance', icon: Sparkles },
];

/**
 * Nested routes should keep their parent tab lit (e.g. /reports/[id] → Reports),
 * so this is a prefix match rather than equality. Shared by both navs so the
 * active-state rule is identical in each.
 */
export function isNavLinkActive(pathname: string | null, href: string): boolean {
  return pathname === href || Boolean(pathname?.startsWith(`${href}/`));
}
