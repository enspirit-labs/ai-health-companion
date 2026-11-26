'use client';

import { useQuery } from '@tanstack/react-query';
import type { RecentReportItem, ReportDto } from '@aidoctor/shared';

import { clientFetch } from '@/lib/api/client-fetch';

export function useReports() {
  return useQuery<RecentReportItem[]>({
    queryKey: ['reports'],
    queryFn: () => clientFetch('/api/proxy/reports'),
    staleTime: 30 * 1000,
  });
}

export function useReport(reportId: string | null) {
  return useQuery<ReportDto>({
    queryKey: ['reports', reportId],
    queryFn: () => clientFetch(`/api/proxy/reports/${reportId}`),
    enabled: Boolean(reportId),
  });
}
