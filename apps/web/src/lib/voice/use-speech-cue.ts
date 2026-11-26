'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Spoken-cue helper for guided camera flows (e.g. the squats setup guidance).
 * Handles the three things browser speechSynthesis makes fiddly:
 *  - picking a clear FEMALE English voice (async voice-list loading),
 *  - the user-gesture requirement (must be primed from a click),
 *  - not spamming: a cue must persist briefly before it speaks, and the same
 *    cue won't repeat within a cooldown.
 *
 * It deliberately knows nothing about squats — it just speaks strings.
 */

const FEMALE_VOICE_HINTS = [
  'google us english',
  'microsoft aria',
  'microsoft zira',
  'microsoft jenny',
  'samantha',
  'karen',
  'moira',
  'tessa',
  'fiona',
  'victoria',
  'female',
];

function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function pickFemaleVoice(): SpeechSynthesisVoice | null {
  if (!speechSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const english = voices.filter((v) => v.lang?.toLowerCase().startsWith('en'));
  const pool = english.length ? english : voices;
  for (const hint of FEMALE_VOICE_HINTS) {
    const match = pool.find((v) => v.name.toLowerCase().includes(hint));
    if (match) return match;
  }
  return pool[0] ?? null;
}

export interface SpeechCueController {
  /** Whether TTS is supported in this browser. */
  supported: boolean;
  /** Prime from a user gesture (a click). Unlocks later cues + loads voices. */
  enable: () => void;
  /** Offer a cue keyed by `key`. It speaks only after persisting for
   * `debounceMs` and not having been spoken within `cooldownMs`. Passing null
   * clears the pending cue. Safe to call every animation frame. */
  cue: (key: string, text: string) => void;
  /** Speak immediately, bypassing debounce (e.g. a rep count). */
  sayNow: (text: string) => void;
  /** Speak immediately and resolve once the utterance has finished (or failed,
   * or TTS isn't available). Use when what happens next must not overlap the
   * speech — e.g. spoken instructions before a microphone recording starts,
   * where the speaker would otherwise bleed into the capture. */
  sayAndWait: (text: string) => Promise<void>;
  /** Stop any in-flight speech immediately. */
  stop: () => void;
}

export function useSpeechCue(options?: { debounceMs?: number; cooldownMs?: number }): SpeechCueController {
  const debounceMs = options?.debounceMs ?? 700;
  const cooldownMs = options?.cooldownMs ?? 5000;

  const enabledRef = useRef(false);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const pendingRef = useRef<{ key: string; since: number } | null>(null);
  const lastSpokenAtRef = useRef<Record<string, number>>({});
  // Whether the primer utterance has actually been heard (see `enable`).
  const primedRef = useRef(false);
  // Holds whichever utterance is currently queued/speaking so nothing
  // garbage-collects it first — Safari has been observed to silently drop an
  // utterance with no surviving JS reference, even while it's still in the
  // browser's own speech queue. See voice-guidance.ts's `currentUtterance`
  // for the same fix on the non-hook path.
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Builds an utterance with the shared voice/rate/pitch settings.
  const buildUtterance = useCallback((text: string) => {
    const u = new SpeechSynthesisUtterance(text);
    const v = voiceRef.current ?? pickFemaleVoice();
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    } else {
      u.lang = 'en-US';
    }
    u.rate = 1;
    u.pitch = 1.1;
    u.volume = 1;
    return u;
  }, []);

  // Load the preferred voice as soon as the list is available (it populates
  // asynchronously in Chrome/Edge).
  useEffect(() => {
    if (!speechSupported()) return;
    const load = () => {
      voiceRef.current = pickFemaleVoice();
    };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!speechSupported()) return;
      const u = buildUtterance(text);
      utteranceRef.current = u;
      // Cancel-then-speak so cues never queue and lag behind the movement.
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    },
    [buildUtterance],
  );

  const enable = useCallback(() => {
    if (!speechSupported()) return;
    enabledRef.current = true;
    voiceRef.current = pickFemaleVoice();
    // The primer both satisfies the gesture requirement and forces the voice
    // list to load, so later loop-fired cues actually play. Callers may prime
    // more than once — on mount, then again on the first real gesture, because
    // a mount-time attempt is silently dropped by browsers that haven't seen a
    // gesture yet and there's no API to ask whether they have. Latch only once
    // an utterance genuinely starts, so a blocked attempt still retries but a
    // successful one never says "Voice guidance on" twice.
    if (primedRef.current) return;
    const u = buildUtterance('Voice guidance on');
    u.onstart = () => {
      primedRef.current = true;
    };
    utteranceRef.current = u;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }, [buildUtterance]);

  const cue = useCallback(
    (key: string, text: string) => {
      if (!enabledRef.current || !speechSupported()) return;
      const now = performance.now();
      const pending = pendingRef.current;
      if (!pending || pending.key !== key) {
        pendingRef.current = { key, since: now };
        return;
      }
      if (now - pending.since < debounceMs) return;
      const lastAt = lastSpokenAtRef.current[key] ?? -Infinity;
      if (now - lastAt < cooldownMs) return;
      lastSpokenAtRef.current[key] = now;
      speak(text);
    },
    [debounceMs, cooldownMs, speak],
  );

  const sayNow = useCallback(
    (text: string) => {
      if (!enabledRef.current) return;
      speak(text);
    },
    [speak],
  );

  const stop = useCallback(() => {
    // Latch voice off as well as cancelling. `cancel()` alone only kills what's
    // currently being spoken — anything that calls cue()/sayNow() afterwards
    // (a rAF loop that hasn't been torn down yet, a pending timer) would start
    // talking again. Callers use this on unmount, where "no more speech, ever"
    // is what they mean.
    enabledRef.current = false;
    pendingRef.current = null;
    if (!speechSupported()) return;
    window.speechSynthesis.cancel();
  }, []);

  const sayAndWait = useCallback(
    (text: string) =>
      new Promise<void>((resolve) => {
        if (!enabledRef.current || !speechSupported()) {
          resolve();
          return;
        }

        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve();
        };

        const u = buildUtterance(text);
        u.onend = finish;
        u.onerror = finish;
        utteranceRef.current = u;

        // Safety net: `onend` is unreliable in some browsers (notably when the
        // tab is backgrounded mid-utterance), and a caller awaiting this would
        // otherwise stall forever. Fall back to a generous estimate from the
        // text length at a conservative ~10 chars/sec, plus 2s of slack.
        const estimateMs = (text.length / 10) * 1000 + 2000;
        const timeout = setTimeout(finish, estimateMs);

        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      }),
    [buildUtterance],
  );

  return { supported: speechSupported(), enable, cue, sayNow, sayAndWait, stop };
}
