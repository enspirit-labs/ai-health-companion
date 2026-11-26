import { chatSessionLabel } from './chat-session-label';

// multiple sessions are listed, so each one needs a label that
// tells it apart from the others.
describe('chatSessionLabel', () => {
  it('uses the server-derived title when there is one', () => {
    expect(
      chatSessionLabel({ title: 'Am I sleeping enough?', updatedAt: '2026-01-02T00:00:00.000Z', messageCount: 4 }),
    ).toBe('Am I sleeping enough?');
  });

  it('calls a session nobody has spoken in yet a new conversation', () => {
    expect(chatSessionLabel({ title: null, updatedAt: '2026-01-02T00:00:00.000Z', messageCount: 0 })).toBe(
      'New conversation',
    );
  });

  // Deterministic under the mandatory TZ=UTC.
  it('falls back to the last-active date for an untitled session that does have messages', () => {
    expect(chatSessionLabel({ title: null, updatedAt: '2026-01-02T00:00:00.000Z', messageCount: 6 })).toBe(
      'Conversation from 1/2/2026',
    );
  });
});
