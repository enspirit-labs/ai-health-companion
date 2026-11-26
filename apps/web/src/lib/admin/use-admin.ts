'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminPromptTemplateDto,
  AdminStatsDto,
  AdminUserDto,
  PilotMetricsDto,
  UpdateAdminPromptTemplateInput,
  UpdateAdminUserInput,
} from '@aidoctor/shared';

import { clientFetch } from '@/lib/api/client-fetch';

export function useAdminUsers() {
  return useQuery<AdminUserDto[]>({
    queryKey: ['admin', 'users'],
    queryFn: () => clientFetch('/api/proxy/admin/users'),
  });
}

export function useUpdateAdminUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, input }: { userId: string; input: UpdateAdminUserInput }) =>
      clientFetch<AdminUserDto>(`/api/proxy/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData<AdminUserDto[]>(['admin', 'users'], (current) =>
        current?.map((u) => (u.id === updated.id ? updated : u)),
      );
    },
  });
}

export function useAdminStats() {
  return useQuery<AdminStatsDto>({
    queryKey: ['admin', 'stats'],
    queryFn: () => clientFetch('/api/proxy/admin/stats'),
  });
}

export function useAdminPilotMetrics() {
  return useQuery<PilotMetricsDto>({
    queryKey: ['admin', 'pilot-metrics'],
    queryFn: () => clientFetch('/api/proxy/admin/pilot-metrics'),
  });
}

export function useAdminPromptTemplates() {
  return useQuery<AdminPromptTemplateDto[]>({
    queryKey: ['admin', 'prompt-templates'],
    queryFn: () => clientFetch('/api/proxy/admin/prompt-templates'),
  });
}

export function useUpdateAdminPromptTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAdminPromptTemplateInput }) =>
      clientFetch<AdminPromptTemplateDto>(`/api/proxy/admin/prompt-templates/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData<AdminPromptTemplateDto[]>(['admin', 'prompt-templates'], (current) =>
        current?.map((t) => (t.id === updated.id ? updated : t)),
      );
    },
  });
}
