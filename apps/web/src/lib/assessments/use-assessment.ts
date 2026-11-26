'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AnswerAssessmentQuestionInput,
  AssessmentResult,
  AssessmentState,
  AssessmentType,
  RecordTestResultInput,
} from '@aidoctor/shared';

import { ClientApiError, clientFetch } from '@/lib/api/client-fetch';
import { AUTH_QUERY_KEY } from '@/lib/auth/use-auth';
import { isAiConsentRequiredError } from '@/lib/consent/ai-consent';

export function useStartAssessment() {
  return useMutation({
    mutationFn: (type: AssessmentType) =>
      clientFetch<AssessmentState>('/api/proxy/assessments', {
        method: 'POST',
        body: JSON.stringify({ type }),
      }),
  });
}

/**
 * Additive — doesn't touch useStartAssessment's signature or callers.
 * Always starts MENTAL_WELLNESS in PULSE mode; the Daily Pulse page is the
 * only caller, so the type is hardcoded rather than taking a parameter it
 * would never vary.
 */
export function useStartDailyPulse() {
  return useMutation({
    mutationFn: () =>
      clientFetch<AssessmentState>('/api/proxy/assessments', {
        method: 'POST',
        body: JSON.stringify({ type: 'MENTAL_WELLNESS', mode: 'PULSE' }),
      }),
  });
}

export function useAssessmentState(assessmentId: string | null) {
  return useQuery<AssessmentState>({
    queryKey: ['assessment', assessmentId],
    queryFn: () => clientFetch(`/api/proxy/assessments/${assessmentId}`),
    enabled: Boolean(assessmentId),
    staleTime: 5 * 1000,
  });
}

export function useAnswerAssessmentQuestion(assessmentId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AnswerAssessmentQuestionInput) =>
      clientFetch<AssessmentState>(`/api/proxy/assessments/${assessmentId}/answers`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['assessment', assessmentId], data);
    },
  });
}

export function useRecordTestResult(assessmentId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordTestResultInput) =>
      clientFetch<AssessmentState>(`/api/proxy/assessments/${assessmentId}/data`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['assessment', assessmentId], data);
    },
  });
}

export function useUploadAssessmentMedia(assessmentId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ blob, captureLabel }: { blob: Blob; captureLabel?: string }) => {
      const extension = blob.type.split('/')[1]?.split(';')[0] ?? 'jpg';
      const formData = new FormData();
      formData.append('file', blob, `capture.${extension}`);
      if (captureLabel) formData.append('captureLabel', captureLabel);

      // Don't set Content-Type here — the browser must generate the
      // multipart boundary itself; clientFetch's default JSON header would
      // break the upload.
      const res = await fetch(`/api/proxy/assessments/${assessmentId}/media`, {
        method: 'POST',
        body: formData,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new ClientApiError(
          res.status,
          body?.message ?? 'Upload failed',
          body?.errors,
          typeof body?.code === 'string' ? body.code : undefined,
        );
      }
      return body as AssessmentState;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['assessment', assessmentId], data);
    },
  });
}

export function useCompleteAssessment(assessmentId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      clientFetch<AssessmentResult>(`/api/proxy/assessments/${assessmentId}/complete`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    // The server is the source of truth for consent; if it refused, refresh the
    // cached user so the page's AI-consent gate reflects reality.
    onError: (error) => {
      if (isAiConsentRequiredError(error)) queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
    },
  });
}
