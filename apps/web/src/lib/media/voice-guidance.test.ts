import { INITIAL_VOICE_GUIDANCE_STATE, shouldSpeak, type VoiceGuidanceState } from './voice-guidance';

describe('shouldSpeak', () => {
  it('speaks the very first message', () => {
    expect(shouldSpeak(INITIAL_VOICE_GUIDANCE_STATE, 'Center your face.', 1000)).toBe(true);
  });

  it('speaks immediately on a genuine message change', () => {
    const state: VoiceGuidanceState = { lastMessage: 'Center your face.', lastSpokenAt: 1000 };
    expect(shouldSpeak(state, 'Hold still.', 1050)).toBe(true);
  });

  it('does not re-speak the same message before the repeat interval elapses', () => {
    const state: VoiceGuidanceState = { lastMessage: 'Center your face.', lastSpokenAt: 1000 };
    expect(shouldSpeak(state, 'Center your face.', 1000 + 3999)).toBe(false);
  });

  it('re-speaks the same message once the repeat interval has elapsed', () => {
    const state: VoiceGuidanceState = { lastMessage: 'Center your face.', lastSpokenAt: 1000 };
    expect(shouldSpeak(state, 'Center your face.', 1000 + 4000)).toBe(true);
  });
});
