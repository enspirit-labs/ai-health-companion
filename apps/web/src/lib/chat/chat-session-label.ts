import type { ChatSessionSummaryDto } from '@aidoctor/shared';

type LabelledSession = Pick<ChatSessionSummaryDto, 'title' | 'updatedAt' | 'messageCount'>;

/**
 * What a conversation is called in the session picker. Titles are derived
 * server-side from the opening message (see ChatService.touchSession), so a
 * null title normally means "nobody has said anything in this one yet" — the
 * dated fallback covers the residual case of a session that has messages but
 * somehow no title, so a real conversation is never labelled as new.
 */
export function chatSessionLabel(session: LabelledSession): string {
  if (session.title) return session.title;
  if (session.messageCount === 0) return 'New conversation';
  return `Conversation from ${new Date(session.updatedAt).toLocaleDateString()}`;
}
