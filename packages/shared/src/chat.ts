import { z } from 'zod';

import { RED_FLAG_CATEGORIES, RED_FLAG_KINDS } from './red-flags';

export const CHAT_ROLES = ['USER', 'ASSISTANT'] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];

export const ChatMessageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(CHAT_ROLES),
  content: z.string(),
  createdAt: z.string().datetime(),
});
export type ChatMessageDto = z.infer<typeof ChatMessageSchema>;

/**
 * One row in the user's list of conversations. `title` is derived server-side
 * from the first message of the session (null until that first message
 * lands), and `updatedAt` tracks last activity, not last edit — the API
 * touches the session row on every send so the list can be ordered by
 * recency.
 */
export const ChatSessionSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  messageCount: z.number().int().min(0),
});
export type ChatSessionSummaryDto = z.infer<typeof ChatSessionSummarySchema>;

export const SendChatMessageSchema = z.object({
  content: z.string().min(1).max(2000),
});
export type SendChatMessageInput = z.infer<typeof SendChatMessageSchema>;

/**
 * Present only when the red-flag detector fired on the user's message and the
 * model was skipped: the assistant message is then fixed copy.
 */
export const ChatEscalationSchema = z.object({
  kind: z.enum(RED_FLAG_KINDS),
  category: z.enum(RED_FLAG_CATEGORIES),
});
export type ChatEscalation = z.infer<typeof ChatEscalationSchema>;

export const SendChatMessageResponseSchema = z.object({
  userMessage: ChatMessageSchema,
  assistantMessage: ChatMessageSchema,
  escalation: ChatEscalationSchema.optional(),
});
export type SendChatMessageResponse = z.infer<typeof SendChatMessageResponseSchema>;
