import { AppHeader } from '@/components/app-header';
import { MockModeBanner } from '@/components/mock-mode-banner';
import { MobileTabBar } from '@/components/mobile-tab-bar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MockModeBanner />
      <AppHeader />
      {children}
      {/* Compact-viewport primary navigation. Rendered after `children` so its
          `sticky bottom-0` resolves against the root layout's flex column, and
          so it settles above the compliance footer at the end of the document
          rather than covering it. Hidden at md+, where AppHeader's nav takes
          over. */}
      <MobileTabBar />
    </>
  );
}
