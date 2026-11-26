import { act, renderHook } from '@testing-library/react';

import { useSpeechCue } from './use-speech-cue';

/**
 * Covers the guarantee the camera flows rely on when unmounting: after stop(),
 * nothing speaks again. speechSynthesis is a browser global that outlives the
 * component, so a cue fired from a still-running rAF loop (or a pending timer)
 * would otherwise keep talking over the next screen.
 */

class FakeUtterance {
  text: string;
  voice: unknown = null;
  lang = '';
  rate = 1;
  pitch = 1;
  volume = 1;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

interface FakeSynth {
  speak: jest.Mock<void, [FakeUtterance]>;
  cancel: jest.Mock;
  getVoices: jest.Mock;
  addEventListener: jest.Mock;
  removeEventListener: jest.Mock;
}

let synth: FakeSynth;

/** Text of every utterance passed to speak(), in order. */
function spokenTexts(): string[] {
  return synth.speak.mock.calls.map(([u]) => u.text);
}

beforeEach(() => {
  synth = {
    // Utterances only "start" when we say so, mirroring a browser that silently
    // drops speech until it has seen a user gesture.
    speak: jest.fn<void, [FakeUtterance]>((u) => u.onstart?.()),
    cancel: jest.fn(),
    getVoices: jest.fn(() => []),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = FakeUtterance;
});

describe('useSpeechCue stop()', () => {
  it('cancels in-flight speech and blocks anything spoken afterwards', () => {
    const { result } = renderHook(() => useSpeechCue());

    act(() => result.current.enable());
    act(() => result.current.sayNow('one'));
    expect(spokenTexts()).toContain('one');

    act(() => result.current.stop());
    expect(synth.cancel).toHaveBeenCalled();

    // The component is gone but its rAF loop got one more frame in.
    const countBefore = synth.speak.mock.calls.length;
    act(() => result.current.sayNow('two'));
    act(() => result.current.cue('some-key', 'three'));
    expect(synth.speak.mock.calls.length).toBe(countBefore);
    expect(spokenTexts()).not.toContain('two');
    expect(spokenTexts()).not.toContain('three');
  });

  it('can be re-enabled after stopping', () => {
    // Retake flows reuse the same hook instance after a stop.
    const { result } = renderHook(() => useSpeechCue());

    act(() => result.current.enable());
    act(() => result.current.stop());
    act(() => result.current.enable());
    act(() => result.current.sayNow('back on'));

    expect(spokenTexts()).toContain('back on');
  });
});

describe('useSpeechCue enable()', () => {
  it('speaks the primer only once when already unlocked', () => {
    // enable() is called on mount and again on the first real gesture; the user
    // must not hear "Voice guidance on" twice.
    const { result } = renderHook(() => useSpeechCue());

    act(() => result.current.enable());
    act(() => result.current.enable());

    expect(spokenTexts().filter((t) => t === 'Voice guidance on')).toHaveLength(1);
  });

  it('retries the primer while the browser is still blocking speech', () => {
    // A blocked browser drops the utterance without ever firing onstart, so the
    // next gesture must try again rather than assuming voice is live.
    synth.speak.mockImplementation(() => {});
    const { result } = renderHook(() => useSpeechCue());

    act(() => result.current.enable());
    act(() => result.current.enable());
    expect(spokenTexts().filter((t) => t === 'Voice guidance on')).toHaveLength(2);

    // Gesture granted — this one lands, and further calls stop retrying.
    synth.speak.mockImplementation((u: FakeUtterance) => u.onstart?.());
    act(() => result.current.enable());
    act(() => result.current.enable());
    expect(spokenTexts().filter((t) => t === 'Voice guidance on')).toHaveLength(3);
  });
});
