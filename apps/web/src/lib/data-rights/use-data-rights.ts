'use client';

import { useMutation } from '@tanstack/react-query';
import type { DeleteAccountInput } from '@aidoctor/shared';

import { clientFetch } from '@/lib/api/client-fetch';
import { hardNavigate } from '@/lib/navigation';

/**
 * Permanently deletes the signed-in user's account and data. On success the
 * browser's session cookies are cleared (the server-side session is already
 * gone, so the logout call itself may find nothing to revoke) and the page is
 * fully reloaded to the home page so nothing of the old account stays in memory.
 */
export function useDeleteAccount() {
  return useMutation<unknown, Error, DeleteAccountInput>({
    mutationFn: async (input) => {
      await clientFetch('/api/proxy/auth/me', { method: 'DELETE', body: JSON.stringify(input) });
      await clientFetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    },
    onSuccess: () => hardNavigate('/'),
  });
}

/** Saves `data` to the user's device as a pretty-printed JSON file. */
function saveJsonFile(filename: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Downloads the signed-in user's own data as a JSON file. */
export function useExportData() {
  return useMutation<void, Error>({
    mutationFn: async () => {
      const data = await clientFetch<unknown>('/api/proxy/auth/me/export');
      saveJsonFile(`my-health-companion-data-${new Date().toISOString().slice(0, 10)}.json`, data);
    },
  });
}
