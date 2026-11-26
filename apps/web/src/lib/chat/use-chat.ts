'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ChatEscalation,
  ChatMessageDto,
  ChatSessionSummaryDto,
  SendChatMessageResponse,
} from '@aidoctor/shared';

import { clientFetch } from '@/lib/api/client-fetch';
import { AUTH_QUERY_KEY } from '@/lib/auth/use-auth';
import { isAiConsentRequiredError } from '@/lib/consent/ai-consent';

const CHAT_SESSIONS_QUERY_KEY = ['chat', 'sessions'];
const chatMessagesQueryKey = (sessionId: string | null) => ['chat', 'messages', sessionId];

/** the user's conversations, most recently active first. */
export function useChatSessions() {
  return useQuery<ChatSessionSummaryDto[]>({
    queryKey: CHAT_SESSIONS_QUERY_KEY,
    queryFn: () => clientFetch('/api/proxy/chat/sessions'),
  });
}

/** start a new conversation. */
export function useCreateChatSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => clientFetch<ChatSessionSummaryDto>('/api/proxy/chat/sessions', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CHAT_SESSIONS_QUERY_KEY }),
  });
}

/** read one conversation back, in order. Idle until a session is chosen. */
export function useChatHistory(sessionId: string | null) {
  return useQuery<ChatMessageDto[]>({
    queryKey: chatMessagesQueryKey(sessionId),
    queryFn: () => clientFetch(`/api/proxy/chat/sessions/${sessionId}/messages`),
    enabled: Boolean(sessionId),
  });
}

export function useSendChatMessage(
  sessionId: string | null,
  options?: {
    /**
     * Fired with the session the message actually landed in — which the caller
     * doesn't know in advance on a first-ever message, where there is no
     * session yet and the mutation creates one. Handing the id back this way
     * (rather than as a second `mutate` argument) keeps the call site
     * `mutate(content)`.
     */
    onSessionResolved?: (sessionId: string) => void;
    /**
     * Fired when the API answered with fixed escalation copy instead of a model
     * reply. The stored message carries no flag of its own, so the
     * page uses this to show the alert card for the live turn.
     */
    onEscalation?: (assistantMessageId: string, escalation: ChatEscalation) => void;
  },
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (content: string) => {
      const targetSessionId =
        sessionId ??
        (await clientFetch<ChatSessionSummaryDto>('/api/proxy/chat/sessions', { method: 'POST' })).id;

      const response = await clientFetch<SendChatMessageResponse>(
        `/api/proxy/chat/sessions/${targetSessionId}/messages`,
        { method: 'POST', body: JSON.stringify({ content }) },
      );
      return { ...response, sessionId: targetSessionId };
    },
    onSuccess: (data) => {
      queryClient.setQueryData<ChatMessageDto[]>(chatMessagesQueryKey(data.sessionId), (current) => [
        ...(current ?? []),
        data.userMessage,
        data.assistantMessage,
      ]);
      // The session's title and last-active time both change on its first
      // message, so the picker has to re-read the list.
      queryClient.invalidateQueries({ queryKey: CHAT_SESSIONS_QUERY_KEY });
      if (data.escalation) options?.onEscalation?.(data.assistantMessage.id, data.escalation);
      options?.onSessionResolved?.(data.sessionId);
    },
    // The server is the source of truth for consent; if it refused, refresh the
    // cached user so the chat page's AI-consent gate reflects reality.
    onError: (error) => {
      if (isAiConsentRequiredError(error)) queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
    },
  });
}
