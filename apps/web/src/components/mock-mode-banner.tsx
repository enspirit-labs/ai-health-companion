'use client';

import { TriangleAlert } from 'lucide-react';

import { useProviderMode } from '@/lib/provider-mode/use-provider-mode';

/**
 * Persistent banner shown whenever the AI provider is the mock. Mock output is canned,
 * so nobody should mistake it for a real result. Renders nothing while loading, on error
 * or when a real provider is active.
 */
export function MockModeBanner() {
  const { data } = useProviderMode();

  if (!data?.mock) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex items-center justify-center gap-2 border-b border-amber-600 bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-950"
    >
      <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
      <span>
        Demo mode: the AI is running on a mock provider, so results and replies are sample content, not real AI output.
      </span>
    </div>
  );
}
