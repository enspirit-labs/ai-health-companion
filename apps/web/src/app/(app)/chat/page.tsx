'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy, HeartPulse, MessageCircle, Plus, Send } from 'lucide-react';
import { isEscalationMessage, type EscalationKind } from '@aidoctor/shared';

import { ClientApiError } from '@/lib/api/client-fetch';
import { AiConsentGate } from '@/components/ai-consent-gate';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChatBubble, initialsFromName } from '@/components/chat-bubble';
import { renderChatMessage } from '@/lib/chat/render-message';
import { ChatTypingIndicator } from '@/components/chat-typing-indicator';
import { EscalationCard } from '@/components/escalation-card';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { LoadingState } from '@/components/loading-state';
import { PageHeader } from '@/components/page-header';
import { TechniqueNote } from '@/components/technique-note';
import { useCurrentUser } from '@/lib/auth/use-auth';
import { chatSessionLabel } from '@/lib/chat/chat-session-label';
import { useChatHistory, useChatSessions, useCreateChatSession, useSendChatMessage } from '@/lib/chat/use-chat';
import { cn } from '@/lib/utils';

/** Job-based openers for an empty thread. Picking one fills the composer rather
 * than sending, so the user can edit it first. */
const STARTER_PROMPTS = [
  'What do my latest results say about me?',
  'I slept badly this week, any tips?',
  'How can I fit more movement into my day?',
  'Help me build a calmer evening routine.',
];

/** Tallest the composer grows before it scrolls, in px (about six lines). */
const COMPOSER_MAX_HEIGHT = 160;

/** The reply as plain text, without the `**` bold markers. */
function plainText(content: string): string {
  return content.replace(/\*\*(\S(?:[^*\n]*?\S)?)\*\*/g, '$1');
}

function CopyReplyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(plainText(content));
      setCopied(true);
    } catch {
      // Clipboard can be blocked (permissions, insecure context); the text is
      // still selectable in the bubble, so fail quietly.
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      aria-label={copied ? 'Reply copied' : 'Copy reply'}
      className="h-7 gap-1 px-2 text-xs text-muted-foreground"
    >
      {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

export default function ChatPage() {
  const sessions = useChatSessions();
  // Unset until the user picks one — the default is then whatever they were
  // last active in, since the list comes back most-recent-first (to
  // "continue a previous one" without having to choose it).
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const activeSessionId = selectedSessionId ?? sessions.data?.[0]?.id ?? null;

  const history = useChatHistory(activeSessionId);
  const createSession = useCreateChatSession();
  // On a first-ever message there is no session yet; the mutation creates one
  // and reports back which session the message landed in.
  // Assistant messages that came back with `escalation` this visit; messages loaded
  // from history are recognised by their fixed copy instead (isEscalationMessage).
  const [liveEscalations, setLiveEscalations] = useState<Record<string, EscalationKind>>({});
  const sendMessage = useSendChatMessage(activeSessionId, {
    onSessionResolved: setSelectedSessionId,
    onEscalation: (messageId, escalation) =>
      setLiveEscalations((current) => ({ ...current, [messageId]: escalation.kind })),
  });
  // Already in the query cache — AppHeader mounts this on every authenticated
  // page — so this is only here to name the user's avatar, not to fetch.
  const { data: user } = useCurrentUser();
  const [draft, setDraft] = useState('');
  // Kept so a failed send can be retried with its original content, which the
  // input no longer holds (it is cleared optimistically on submit).
  const [lastAttempt, setLastAttempt] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wasPending = useRef(false);

  const userInitials = initialsFromName(user?.fullName);

  // A disabled TanStack query is `pending` + `idle`: neither loading nor
  // holding data. So with no session yet, fall back to an explicit empty
  // thread rather than letting `history.data` stay undefined and render a
  // blank panel with no empty state.
  const messages = activeSessionId ? history.data : [];
  const isLoading = sessions.isLoading || history.isLoading;
  const isError = sessions.isError || history.isError;
  const isBusy = sendMessage.isPending || createSession.isPending;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages?.length, sendMessage.isPending]);

  // The composer is disabled while a send is in flight, which drops focus to
  // <body>; put it back when the send settles so a keyboard user can keep typing.
  useEffect(() => {
    if (wasPending.current && !sendMessage.isPending) inputRef.current?.focus();
    wasPending.current = sendMessage.isPending;
  }, [sendMessage.isPending]);

  // Grow the composer with its content, up to COMPOSER_MAX_HEIGHT.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    // Empty: let rows={1} size it. Chrome counts the placeholder in scrollHeight,
    // and on first paint it can wrap in a not-yet-laid-out box.
    if (!draft) return;
    input.style.height = `${Math.min(input.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
  }, [draft]);

  function send(content: string) {
    setLastAttempt(content);
    sendMessage.mutate(content);
    // Covers submitting via the send button (which takes focus on click) when the
    // mutation settles too fast to produce a pending -> idle transition above.
    inputRef.current?.focus();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submitDraft();
  }

  function submitDraft() {
    const content = draft.trim();
    if (!content || sendMessage.isPending) return;
    setDraft('');
    send(content);
  }

  // Enter sends; Shift+Enter adds a line. Skipped mid-IME-composition so
  // confirming a Japanese/Chinese candidate doesn't send half a message.
  function handleComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    submitDraft();
  }

  function pickStarterPrompt(prompt: string) {
    setDraft(prompt);
    inputRef.current?.focus();
  }

  /** The API reuses an already-empty session, so repeat clicks
   * don't accumulate blank threads — they land back on the same fresh one. */
  function handleNewChat() {
    createSession.mutate(undefined, { onSuccess: (session) => setSelectedSessionId(session.id) });
  }

  function handleRetry() {
    // Retry only renders behind `sendMessage.isError`, which cannot be true unless
    // send() already ran, so lastAttempt is always set here — the guard is a
    // type narrow, not a fallback path.
    if (!lastAttempt || sendMessage.isPending) return;
    send(lastAttempt);
  }

  return (
    <AiConsentGate>
    <main id="main-content" className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6">
      <PageHeader
        title="AI Health Coach"
        icon={HeartPulse}
        actions={
          <div className="flex min-w-0 items-center gap-2">
            {sessions.data && sessions.data.length > 0 ? (
              <Select value={activeSessionId ?? undefined} onValueChange={setSelectedSessionId} disabled={isBusy}>
                <SelectTrigger className="w-40 sm:w-56" aria-label="Conversation">
                  <SelectValue placeholder="Select a conversation" />
                </SelectTrigger>
                <SelectContent>
                  {sessions.data.map((session) => (
                    <SelectItem key={session.id} value={session.id}>
                      {chatSessionLabel(session)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Button variant="outline" size="sm" onClick={handleNewChat} disabled={isBusy} className="shrink-0">
              <Plus className="size-4" />
              New chat
            </Button>
          </div>
        }
      />

      {/* Card-style surface (same tokens as ui/Card) with the brand gradient hairline
          WellnessDisclaimer already uses, so the thread reads as its own panel rather
          than as loose text on the page background. */}
      <div className="stripe-top stripe-top-thin flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card/50 shadow-sm">
        <div
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-label="Conversation with your AI Health Coach"
          className="flex flex-1 flex-col gap-4 overflow-y-auto p-4"
        >
          {isLoading ? (
            <LoadingState label="Loading conversation…" />
          ) : isError ? (
            <ErrorState
              description="Could not load your conversation."
              onRetry={() => {
                sessions.refetch();
                history.refetch();
              }}
            />
          ) : messages && messages.length === 0 ? (
            <EmptyState
              icon={MessageCircle}
              message="Ask your AI Health Coach anything about your wellness results. It can see your recent scores and assessments."
              className="pb-4"
            />
          ) : (
            messages?.map((message, index) => {
              const role = message.role === 'USER' ? 'user' : 'assistant';
              const followsSameSpeaker = index > 0 && messages[index - 1].role === message.role;
              const escalationKind =
                message.role === 'ASSISTANT'
                  ? (liveEscalations[message.id] ?? isEscalationMessage(message.content))
                  : null;
              return (
                // Consecutive turns from the same speaker sit closer together than a
                // speaker change, so the eye groups them as one turn.
                <div key={message.id} className={cn(followsSameSpeaker && '-mt-2')}>
                  {escalationKind ? (
                    <>
                      <span className="sr-only">AI Health Coach said</span>
                      <EscalationCard kind={escalationKind}>{message.content}</EscalationCard>
                    </>
                  ) : (
                    <>
                      <ChatBubble role={role} initials={userInitials}>
                        {role === 'assistant' ? renderChatMessage(message.content) : message.content}
                      </ChatBubble>
                      {role === 'assistant' ? (
                        // pl-10 lines the action up with the bubble, past the avatar.
                        <div className="mt-1 pl-10">
                          <CopyReplyButton content={message.content} />
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              );
            })
          )}

          {!isLoading && !isError && messages && messages.length === 0 ? (
            <div role="group" aria-label="Suggested questions" className="flex flex-wrap justify-center gap-2">
              {STARTER_PROMPTS.map((prompt) => (
                <Button
                  key={prompt}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-auto rounded-full py-1.5 whitespace-normal"
                  onClick={() => pickStarterPrompt(prompt)}
                >
                  {prompt}
                </Button>
              ))}
            </div>
          ) : null}

          {sendMessage.isPending ? <ChatTypingIndicator /> : null}

          <div ref={bottomRef} />
        </div>
      </div>

      {createSession.isError ? (
        <ErrorState
          title="Couldn’t start a new conversation"
          description="Try again in a moment."
          retryLabel="Try again"
          onRetry={handleNewChat}
          className="gap-1 py-3"
        />
      ) : null}

      {/* Neutral copy only — never the raw mutation error (see error-state.tsx).
          A 503 means the coach itself was unavailable and nothing was saved,
          so retrying the same message is safe. */}
      {sendMessage.isError ? (
        <ErrorState
          title="Message not sent"
          description={
            sendMessage.error instanceof ClientApiError && sendMessage.error.status === 503
              ? "The coach couldn't reply just now. Your message wasn't sent, so give it a moment and try again."
              : "Couldn't send that — try again."
          }
          retryLabel="Try again"
          onRetry={handleRetry}
          className="gap-1 py-3"
        />
      ) : null}

      <form className="flex items-end gap-2" onSubmit={handleSubmit}>
        <Textarea
          autoFocus
          ref={inputRef}
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder="Ask about your results…"
          aria-label="Message your AI Health Coach"
          aria-describedby="composer-hint"
          disabled={sendMessage.isPending}
          className="min-h-10 flex-1 resize-none rounded-2xl px-4 py-2.5 leading-5"
        />
        <Button
          type="submit"
          size="icon"
          aria-label="Send message"
          className="size-10 coarse:size-11"
          disabled={!draft.trim() || sendMessage.isPending}
        >
          <Send className="size-4" />
        </Button>
      </form>
      <p id="composer-hint" className="-mt-2 hidden px-4 text-xs text-muted-foreground sm:block">
        Enter to send, Shift + Enter for a new line
      </p>

      <TechniqueNote feature="coach" />
    </main>
    </AiConsentGate>
  );
}
