import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ESCALATION_COPY } from '@aidoctor/shared';

import { ClientApiError } from '@/lib/api/client-fetch';
import { useCurrentUser } from '@/lib/auth/use-auth';
import { useChatHistory, useChatSessions, useCreateChatSession, useSendChatMessage } from '@/lib/chat/use-chat';
import ChatPage from './page';

jest.mock('@/lib/chat/use-chat', () => ({
  useChatHistory: jest.fn(),
  useChatSessions: jest.fn(),
  useCreateChatSession: jest.fn(),
  useSendChatMessage: jest.fn(),
}));

// Only consumed for the user's avatar initials — AppHeader already mounts this
// query on every authenticated page, so the page never fetches on its own.
jest.mock('@/lib/auth/use-auth', () => ({
  useCurrentUser: jest.fn(),
}));
jest.mock('@/lib/consent/use-consent', () => ({
  useUpdateConsent: () => ({ isPending: false, isError: false, mutate: jest.fn() }),
}));

// The session picker is a Radix Select: its popper positioning calls
// ResizeObserver, and opening it needs pointer-capture — jsdom has neither.
// Same stubs as the Reports page test.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
  window.HTMLElement.prototype.hasPointerCapture = () => false;
});

const mockUseChatHistory = useChatHistory as jest.Mock;
const mockUseChatSessions = useChatSessions as jest.Mock;
const mockUseCreateChatSession = useCreateChatSession as jest.Mock;
const mockUseSendChatMessage = useSendChatMessage as jest.Mock;
const mockUseCurrentUser = useCurrentUser as jest.Mock;

const USER_MESSAGE = { id: 'm1', role: 'USER', content: 'How am I doing?' };
const ASSISTANT_MESSAGE = { id: 'm2', role: 'ASSISTANT', content: 'Your scores look steady.' };

// the page now reads a list of sessions, most recently active first.
const SESSION_RECENT = {
  id: 'session-recent',
  title: 'Sleep and stress',
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  messageCount: 2,
};
const SESSION_OLDER = {
  id: 'session-older',
  title: 'Stretching routine',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  messageCount: 4,
};

function historyWith(data: unknown[]) {
  return { isLoading: false, isError: false, data, refetch: jest.fn() };
}

function sessionsWith(data: unknown[]) {
  return { isLoading: false, isError: false, data, refetch: jest.fn() };
}

describe('ChatPage', () => {
  beforeEach(() => {
    mockUseSendChatMessage.mockReturnValue({ isPending: false, isError: false, mutate: jest.fn() });
    mockUseChatSessions.mockReturnValue(sessionsWith([SESSION_RECENT, SESSION_OLDER]));
    mockUseCreateChatSession.mockReturnValue({ isPending: false, isError: false, mutate: jest.fn() });
    mockUseCurrentUser.mockReturnValue({ data: { fullName: 'Ada Lovelace', consentAiProcessing: true } });
    Element.prototype.scrollIntoView = jest.fn();
  });

  it('shows a loading state while history is pending', () => {
    mockUseChatHistory.mockReturnValue({ isLoading: true, isError: false, data: undefined, refetch: jest.fn() });
    render(<ChatPage />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading conversation…');
  });

  it('shows an error state when history fails to load', () => {
    mockUseChatHistory.mockReturnValue({ isLoading: false, isError: true, data: undefined, refetch: jest.fn() });
    render(<ChatPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load your conversation.');
  });

  it('shows an empty prompt when there is no history yet', () => {
    mockUseChatHistory.mockReturnValue(historyWith([]));
    render(<ChatPage />);
    expect(screen.getByText(/ask your ai health coach anything/i)).toBeInTheDocument();
  });

  it('renders message bubbles on success', () => {
    mockUseChatHistory.mockReturnValue(historyWith([USER_MESSAGE]));
    render(<ChatPage />);
    expect(screen.getByText('How am I doing?')).toBeInTheDocument();
  });

  // page header and empty state render with icons.
  it("shows the coach's **bold** markers as bold text, and leaves the user's own text as typed", () => {
    mockUseChatHistory.mockReturnValue(
      historyWith([
        { id: 'm1', role: 'USER', content: 'What does **this** do?' },
        { id: 'm2', role: 'ASSISTANT', content: '**Keep a steady rhythm**\n- Wake up at the same time.' },
      ]),
    );
    render(<ChatPage />);
    expect(screen.getByText('Keep a steady rhythm').tagName).toBe('STRONG');
    expect(screen.queryByText(/\*\*Keep a steady rhythm\*\*/)).not.toBeInTheDocument();
    expect(screen.getByText('What does **this** do?')).toBeInTheDocument();
  });

  it('anchors the page header with an icon', () => {
    mockUseChatHistory.mockReturnValue(historyWith([]));
    render(<ChatPage />);
    const heading = screen.getByRole('heading', { name: 'AI Health Coach' });
    expect(heading.parentElement?.querySelector('svg')).toBeInTheDocument();
  });

  it('anchors the empty state with an icon', () => {
    mockUseChatHistory.mockReturnValue(historyWith([]));
    render(<ChatPage />);
    expect(screen.getByRole('status').querySelector('svg')).toBeInTheDocument();
  });

  // new messages are announced without re-reading history.
  it('puts the conversation in a polite log region', () => {
    mockUseChatHistory.mockReturnValue(historyWith([USER_MESSAGE]));
    render(<ChatPage />);
    const log = screen.getByRole('log');
    expect(log).toHaveAttribute('aria-live', 'polite');
    expect(log).toHaveAttribute('aria-relevant', 'additions');
    expect(log).toHaveTextContent('How am I doing?');
  });

  // every message renders with a role-appropriate avatar.
  it('labels each turn with its speaker and avatar', () => {
    mockUseChatHistory.mockReturnValue(historyWith([USER_MESSAGE, ASSISTANT_MESSAGE]));
    render(<ChatPage />);
    expect(screen.getByText('You said')).toBeInTheDocument();
    expect(screen.getByText('AI Health Coach said')).toBeInTheDocument();
    // Initials come from the signed-in user's name.
    expect(screen.getByText('AL')).toBeInTheDocument();
  });

  // animated typing indicator replaces the literal "Thinking…" string.
  it('shows the typing indicator instead of a Thinking label while a send is in flight', () => {
    mockUseChatHistory.mockReturnValue(historyWith([USER_MESSAGE]));
    mockUseSendChatMessage.mockReturnValue({ isPending: true, isError: false, mutate: jest.fn() });
    render(<ChatPage />);
    expect(screen.getByRole('status')).toHaveTextContent('AI Health Coach is typing');
    expect(screen.queryByText(/thinking/i)).toBeNull();
  });

  // failed sends show a visible, non-raw failure state with retry.
  it('shows neutral failure copy when a send fails', () => {
    mockUseChatHistory.mockReturnValue(historyWith([USER_MESSAGE]));
    mockUseSendChatMessage.mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error('500 POST /api/proxy/chat/messages leaked internals'),
      mutate: jest.fn(),
    });
    render(<ChatPage />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Message not sent');
    expect(alert).toHaveTextContent("Couldn't send that — try again.");
    expect(alert).not.toHaveTextContent(/leaked internals/);
  });

  // a 503 from the API means the coach was unavailable and nothing was saved.
  it('explains that nothing was sent and offers a retry when the coach is unavailable (503)', () => {
    mockUseChatHistory.mockReturnValue(historyWith([USER_MESSAGE]));
    mockUseSendChatMessage.mockReturnValue({
      isPending: false,
      isError: true,
      error: new ClientApiError(503, 'raw upstream detail'),
      mutate: jest.fn(),
    });
    render(<ChatPage />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("The coach couldn't reply just now");
    expect(alert).toHaveTextContent("Your message wasn't sent");
    expect(alert).not.toHaveTextContent(/raw upstream detail/);
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('retries the last attempted message from the failure state', async () => {
    const user = userEvent.setup();
    const mutate = jest.fn();
    mockUseChatHistory.mockReturnValue(historyWith([USER_MESSAGE]));
    mockUseSendChatMessage.mockReturnValue({ isPending: false, isError: true, mutate });
    render(<ChatPage />);

    await user.type(screen.getByRole('textbox'), 'Am I sleeping enough?');
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    expect(mutate).toHaveBeenCalledWith('Am I sleeping enough?');

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mutate).toHaveBeenCalledTimes(2);
    expect(mutate).toHaveBeenLastCalledWith('Am I sleeping enough?');
  });

  // / ISS-1: keyboard — Enter submits, and focus comes back to the
  // composer once the send settles. The pending -> settled transition is driven
  // explicitly here: asserting focus straight after submit would pass trivially
  // (the input never lost it), which proves nothing about the restoration logic.
  it('submits on Enter and returns focus to the input once the send settles', async () => {
    const user = userEvent.setup();
    const mutate = jest.fn();
    mockUseChatHistory.mockReturnValue(historyWith([USER_MESSAGE]));
    mockUseSendChatMessage.mockReturnValue({ isPending: false, isError: false, mutate });
    const { rerender } = render(<ChatPage />);

    const input = screen.getByRole('textbox');
    await user.type(input, 'How is my posture?{Enter}');
    expect(mutate).toHaveBeenCalledWith('How is my posture?');
    expect(input).toHaveValue('');

    // Send in flight: the composer is disabled, which is what drops focus to <body>.
    // jsdom implements neither half of that — it neither unfocuses on disable nor
    // honours blur() on an already-disabled element — so blur first, then commit the
    // pending render. Same end state a real browser reaches.
    input.blur();
    mockUseSendChatMessage.mockReturnValue({ isPending: true, isError: false, mutate });
    rerender(<ChatPage />);
    expect(input).toBeDisabled();
    expect(input).not.toHaveFocus();

    // Send settled: nothing else can restore focus, so this fails if the
    // pending -> idle effect in page.tsx is removed.
    mockUseSendChatMessage.mockReturnValue({ isPending: false, isError: false, mutate });
    rerender(<ChatPage />);
    expect(input).toBeEnabled();
    expect(input).toHaveFocus();
  });

  it('keeps the send button disabled until there is something to send', async () => {
    const user = userEvent.setup();
    mockUseChatHistory.mockReturnValue(historyWith([USER_MESSAGE]));
    render(<ChatPage />);

    const sendButton = screen.getByRole('button', { name: 'Send message' });
    expect(sendButton).toBeDisabled();
    await user.type(screen.getByRole('textbox'), 'Hello');
    expect(sendButton).toBeEnabled();
  });

  // edge case: the draft is cleared synchronously on submit, which is
  // the only guard against a fast double-click firing the mutation twice with
  // the same content (the mock does not reflect isPending flipping true).
  it('does not double-send when the send button is clicked twice in rapid succession', () => {
    const mutate = jest.fn();
    mockUseChatHistory.mockReturnValue(historyWith([USER_MESSAGE]));
    mockUseSendChatMessage.mockReturnValue({ isPending: false, isError: false, mutate });
    render(<ChatPage />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Am I hydrated enough?' } });
    const sendButton = screen.getByRole('button', { name: 'Send message' });
    fireEvent.click(sendButton);
    fireEvent.click(sendButton);

    expect(mutate).toHaveBeenCalledTimes(1);
  });

  // edge case: retry must keep resending the same original content
  // across repeated failures, not just the first one.
  it('retries again after a second failure, still with the original content', async () => {
    const user = userEvent.setup();
    const mutate = jest.fn();
    mockUseChatHistory.mockReturnValue(historyWith([USER_MESSAGE]));
    mockUseSendChatMessage.mockReturnValue({ isPending: false, isError: true, mutate });
    render(<ChatPage />);

    await user.type(screen.getByRole('textbox'), 'Should I stretch daily?');
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(mutate).toHaveBeenCalledTimes(3);
    mutate.mock.calls.forEach((call) => expect(call[0]).toBe('Should I stretch daily?'));
  });

  // every message renders with a role-appropriate avatar — including
  // the degraded case where the signed-in user's name hasn't loaded / is empty.
  it('falls back to a glyph avatar when the signed-in user has no usable name', () => {
    mockUseCurrentUser.mockReturnValue({ data: { fullName: '', consentAiProcessing: true } });
    mockUseChatHistory.mockReturnValue(historyWith([USER_MESSAGE]));
    const { container } = render(<ChatPage />);

    const userAvatarFallback = container.querySelector('[data-slot="avatar-fallback"].bg-primary');
    expect(userAvatarFallback?.querySelector('svg')).toBeInTheDocument();
    expect(userAvatarFallback).not.toHaveTextContent(/[A-Z]/);
  });

  // edge case: whitespace-only input must not count as content to send.
  it('does not submit when the draft is only whitespace', async () => {
    const user = userEvent.setup();
    const mutate = jest.fn();
    mockUseChatHistory.mockReturnValue(historyWith([USER_MESSAGE]));
    mockUseSendChatMessage.mockReturnValue({ isPending: false, isError: false, mutate });
    render(<ChatPage />);

    await user.type(screen.getByRole('textbox'), '   {Enter}');
    expect(mutate).not.toHaveBeenCalled();
  });

  describe('sessions', () => {
    // AC3: multiple sessions per user are supported and listed.
    it('lists every conversation in the session picker', async () => {
      const user = userEvent.setup();
      mockUseChatHistory.mockReturnValue(historyWith([USER_MESSAGE]));
      render(<ChatPage />);

      await user.click(screen.getByRole('combobox', { name: 'Conversation' }));

      expect(screen.getByRole('option', { name: 'Sleep and stress' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Stretching routine' })).toBeInTheDocument();
    });

    // AC1: "continue a previous one" — with no explicit choice, the user lands
    // back in the conversation they were last active in (the list is ordered
    // most-recent-first by the API).
    it('opens the most recently active conversation without the user picking one', () => {
      mockUseChatHistory.mockReturnValue(historyWith([USER_MESSAGE]));
      render(<ChatPage />);

      expect(mockUseChatHistory).toHaveBeenLastCalledWith('session-recent');
      expect(screen.getByRole('combobox', { name: 'Conversation' })).toHaveTextContent('Sleep and stress');
    });

    // AC1 + AC2: picking a previous session shows that session's persisted
    // messages, not the ones from the session we started on.
    it('switches to a previous conversation and shows its messages', async () => {
      const user = userEvent.setup();
      mockUseChatHistory.mockImplementation((sessionId: string | null) =>
        historyWith(
          sessionId === 'session-older'
            ? [{ id: 'm9', role: 'USER', content: 'Should I stretch daily?' }]
            : [USER_MESSAGE],
        ),
      );
      render(<ChatPage />);
      expect(screen.getByText('How am I doing?')).toBeInTheDocument();

      await user.click(screen.getByRole('combobox', { name: 'Conversation' }));
      await user.click(screen.getByRole('option', { name: 'Stretching routine' }));

      expect(screen.getByText('Should I stretch daily?')).toBeInTheDocument();
      expect(screen.queryByText('How am I doing?')).toBeNull();
    });

    // AC1: users can start a new chat session, and it becomes the active one.
    it('starts a new conversation and makes it active', async () => {
      const user = userEvent.setup();
      const newSession = {
        id: 'session-new',
        title: null,
        createdAt: '2026-01-03T00:00:00.000Z',
        updatedAt: '2026-01-03T00:00:00.000Z',
        messageCount: 0,
      };
      const mutate = jest.fn((_variables, options) => options?.onSuccess?.(newSession));
      mockUseCreateChatSession.mockReturnValue({ isPending: false, isError: false, mutate });
      mockUseChatHistory.mockImplementation((sessionId: string | null) =>
        historyWith(sessionId === 'session-new' ? [] : [USER_MESSAGE]),
      );
      render(<ChatPage />);

      await user.click(screen.getByRole('button', { name: /new chat/i }));

      expect(mutate).toHaveBeenCalled();
      // The session list is only refetched by the hook's invalidation, so this
      // assertion — not the picker's label — is what proves the new session is
      // the one now being read.
      expect(mockUseChatHistory).toHaveBeenLastCalledWith('session-new');
      expect(screen.getByText(/ask your ai health coach anything/i)).toBeInTheDocument();
    });

    // AC1 + AC2: a brand-new user has no session at all. The composer must
    // still work, and the send hook is told there's no session yet so it can
    // create one. Note `data: undefined` — a disabled query is neither loading
    // nor holding data, which is exactly the case that used to render blank.
    it('lets a first-ever message create the session it lands in', async () => {
      const user = userEvent.setup();
      const mutate = jest.fn();
      mockUseChatSessions.mockReturnValue(sessionsWith([]));
      mockUseChatHistory.mockReturnValue({ isLoading: false, isError: false, data: undefined, refetch: jest.fn() });
      mockUseSendChatMessage.mockReturnValue({ isPending: false, isError: false, mutate });
      render(<ChatPage />);

      expect(screen.queryByRole('combobox', { name: 'Conversation' })).toBeNull();
      expect(screen.getByText(/ask your ai health coach anything/i)).toBeInTheDocument();

      await user.type(screen.getByRole('textbox'), 'How am I doing?{Enter}');

      expect(mutate).toHaveBeenCalledWith('How am I doing?');
      expect(mockUseSendChatMessage).toHaveBeenLastCalledWith(
        null,
        expect.objectContaining({ onSessionResolved: expect.any(Function) }),
      );
    });

    it('shows a loading state while the conversation list is still pending', () => {
      mockUseChatSessions.mockReturnValue({ isLoading: true, isError: false, data: undefined, refetch: jest.fn() });
      mockUseChatHistory.mockReturnValue({ isLoading: false, isError: false, data: undefined, refetch: jest.fn() });
      render(<ChatPage />);

      expect(screen.getByRole('status')).toHaveTextContent('Loading conversation…');
    });

    it('surfaces a failure to start a new conversation instead of doing nothing', () => {
      mockUseChatHistory.mockReturnValue(historyWith([USER_MESSAGE]));
      mockUseCreateChatSession.mockReturnValue({ isPending: false, isError: true, mutate: jest.fn() });
      render(<ChatPage />);

      expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t start a new conversation');
    });
  });

  // fixed crisis / emergency copy renders as an alert card.
  describe('escalation card', () => {
    const CRISIS_MESSAGE = { id: 'm3', role: 'ASSISTANT', content: ESCALATION_COPY.CRISIS };
    const EMERGENCY_MESSAGE = { id: 'm4', role: 'ASSISTANT', content: ESCALATION_COPY.EMERGENCY };

    it('renders a crisis message loaded from history as an alert with tap-to-call numbers', () => {
      mockUseChatHistory.mockReturnValue(historyWith([USER_MESSAGE, CRISIS_MESSAGE]));
      render(<ChatPage />);

      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(ESCALATION_COPY.CRISIS);
      // numbers present as selectable text and as tel: links
      expect(within(alert).getByRole('link', { name: /998/ })).toHaveAttribute('href', 'tel:998');
      expect(within(alert).getByRole('link', { name: /999/ })).toHaveAttribute('href', 'tel:999');
      expect(within(alert).getByRole('link', { name: /112/ })).toHaveAttribute('href', 'tel:112');
      expect(within(alert).getByRole('link', { name: /911/ })).toHaveAttribute('href', 'tel:911');
      expect(within(alert).getAllByText(/998/).length).toBeGreaterThan(1);
    });

    it('renders an emergency message from history as an alert', () => {
      mockUseChatHistory.mockReturnValue(historyWith([USER_MESSAGE, EMERGENCY_MESSAGE]));
      render(<ChatPage />);

      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent(ESCALATION_COPY.EMERGENCY);
      expect(within(alert).getByRole('link', { name: /998/ })).toHaveAttribute('href', 'tel:998');
    });

    it('does not render an ordinary assistant reply as an alert', () => {
      mockUseChatHistory.mockReturnValue(historyWith([USER_MESSAGE, ASSISTANT_MESSAGE]));
      render(<ChatPage />);

      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByRole('link', { name: /998/ })).toBeNull();
    });

    it('shows the card for a live response that came back with escalation', () => {
      // Live reply content deliberately differs from the fixed copy: the
      // `escalation` field alone must be enough.
      const live = { id: 'm5', role: 'ASSISTANT', content: 'Please call for help.' };
      mockUseChatHistory.mockReturnValue(historyWith([USER_MESSAGE, live]));
      let options: { onEscalation?: (id: string, e: { kind: string; category: string }) => void } | undefined;
      mockUseSendChatMessage.mockImplementation((_sessionId, opts) => {
        options = opts;
        return { isPending: false, isError: false, mutate: jest.fn() };
      });
      const { rerender } = render(<ChatPage />);
      expect(screen.queryByRole('alert')).toBeNull();

      act(() => options?.onEscalation?.('m5', { kind: 'CRISIS', category: 'SUICIDE_OR_SELF_HARM' }));
      rerender(<ChatPage />);

      expect(screen.getByRole('alert')).toHaveTextContent('Please call for help.');
    });

    it('keeps the conversation open: the input stays enabled and the send button works', async () => {
      const user = userEvent.setup();
      const mutate = jest.fn();
      mockUseSendChatMessage.mockReturnValue({ isPending: false, isError: false, mutate });
      mockUseChatHistory.mockReturnValue(historyWith([USER_MESSAGE, CRISIS_MESSAGE]));
      render(<ChatPage />);

      const input = screen.getByRole('textbox', { name: 'Message your AI Health Coach' });
      expect(input).toBeEnabled();

      await user.type(input, 'I am still here');
      await user.click(screen.getByRole('button', { name: 'Send message' }));

      expect(mutate).toHaveBeenCalledWith('I am still here');
    });
  });

  describe('chat UX', () => {
    it('lays out a list in a coach reply as a real list', () => {
      mockUseChatHistory.mockReturnValue(
        historyWith([
          { id: 'm2', role: 'ASSISTANT', content: '**Keep a steady rhythm**\n- Wake up at the same time.\n- Get morning light.' },
        ]),
      );
      render(<ChatPage />);
      const items = within(screen.getByRole('list')).getAllByRole('listitem');
      expect(items.map((item) => item.textContent)).toEqual(['Wake up at the same time.', 'Get morning light.']);
      expect(screen.queryByText(/^- /)).toBeNull();
    });

    it('offers starter questions on an empty thread that fill the composer without sending', async () => {
      const user = userEvent.setup();
      const mutate = jest.fn();
      mockUseSendChatMessage.mockReturnValue({ isPending: false, isError: false, mutate });
      mockUseChatHistory.mockReturnValue(historyWith([]));
      render(<ChatPage />);

      const group = screen.getByRole('group', { name: 'Suggested questions' });
      await user.click(within(group).getByRole('button', { name: 'I slept badly this week, any tips?' }));

      expect(screen.getByRole('textbox')).toHaveValue('I slept badly this week, any tips?');
      expect(screen.getByRole('textbox')).toHaveFocus();
      expect(mutate).not.toHaveBeenCalled();
    });

    it('hides the starter questions once the conversation has messages', () => {
      mockUseChatHistory.mockReturnValue(historyWith([USER_MESSAGE, ASSISTANT_MESSAGE]));
      render(<ChatPage />);
      expect(screen.queryByRole('group', { name: 'Suggested questions' })).toBeNull();
    });

    it('adds a new line on Shift+Enter instead of sending', async () => {
      const user = userEvent.setup();
      const mutate = jest.fn();
      mockUseSendChatMessage.mockReturnValue({ isPending: false, isError: false, mutate });
      mockUseChatHistory.mockReturnValue(historyWith([USER_MESSAGE]));
      render(<ChatPage />);

      await user.type(screen.getByRole('textbox'), 'Line one{Shift>}{Enter}{/Shift}Line two');
      expect(mutate).not.toHaveBeenCalled();
      expect(screen.getByRole('textbox')).toHaveValue('Line one\nLine two');

      await user.keyboard('{Enter}');
      expect(mutate).toHaveBeenCalledWith('Line one\nLine two');
    });

    it('copies a coach reply as plain text, without the bold markers', async () => {
      const user = userEvent.setup();
      const writeText = jest.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      mockUseChatHistory.mockReturnValue(
        historyWith([USER_MESSAGE, { id: 'm2', role: 'ASSISTANT', content: 'Try **more daylight**.' }]),
      );
      render(<ChatPage />);

      await user.click(screen.getByRole('button', { name: 'Copy reply' }));

      expect(writeText).toHaveBeenCalledWith('Try more daylight.');
      expect(await screen.findByRole('button', { name: 'Reply copied' })).toBeInTheDocument();
    });

    it('offers no copy action on the user\'s own messages', () => {
      mockUseChatHistory.mockReturnValue(historyWith([USER_MESSAGE]));
      render(<ChatPage />);
      expect(screen.queryByRole('button', { name: 'Copy reply' })).toBeNull();
    });
  });

  it('shows the AI-consent gate instead of the chat until the user allows AI analysis', () => {
    mockUseCurrentUser.mockReturnValue({ data: { fullName: 'Ada Lovelace', consentAiProcessing: false } });
    render(<ChatPage />);
    expect(screen.getByRole('button', { name: /allow ai analysis/i })).toBeInTheDocument();
    expect(screen.queryByRole('log')).toBeNull();
  });
});
