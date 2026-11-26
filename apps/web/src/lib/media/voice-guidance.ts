'use client';

// Held outside the function so nothing garbage-collects it mid-speech.
// Safari in particular will silently drop an utterance that's still queued
// or speaking if no JS reference to it survives past the call that created
// it — the browser's internal queue reference alone isn't enough to keep it
// alive. See use-speech-cue.ts's `utteranceRef` for the same fix on the
// hook-based path used by the capture screens.
let currentUtterance: SpeechSynthesisUtterance | null = null;

/** Speaks `text` aloud via the browser's SpeechSynthesis API, canceling
 * whatever utterance is already in progress so guidance never queues up
 * stale messages behind a new one. No-ops where the API isn't available
 * (SSR, unsupported browser) rather than throwing. */
export function speak(text: string): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  currentUtterance = new SpeechSynthesisUtterance(text);
  window.speechSynthesis.speak(currentUtterance);
}

/** Silences any in-flight or queued speech immediately. speechSynthesis is a
 * global that outlives any single component, so callers must invoke this on
 * unmount — otherwise a cue spoken just as the user navigates away keeps
 * talking over the next screen. */
export function stopSpeaking(): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
}

export interface VoiceGuidanceState {
  lastMessage: string | null;
  lastSpokenAt: number;
}

export const INITIAL_VOICE_GUIDANCE_STATE: VoiceGuidanceState = { lastMessage: null, lastSpokenAt: -Infinity };

/** A steady "Center your face" shouldn't be re-spoken on every ~150ms
 * inference tick, but also shouldn't go silent forever if the user doesn't
 * react — so the same message repeats only after this long. */
const MIN_REPEAT_INTERVAL_MS = 4000;

/** Decides whether `message` should be spoken now, given the previously
 * spoken message/time: always speaks on a genuine change, and re-speaks an
 * unchanged message only after `MIN_REPEAT_INTERVAL_MS`. Pure — callers own
 * updating their stored state (see teeth-capture.tsx) so this stays trivially
 * testable without touching the real SpeechSynthesis API. */
export function shouldSpeak(state: VoiceGuidanceState, message: string, now: number): boolean {
  if (message !== state.lastMessage) return true;
  return now - state.lastSpokenAt >= MIN_REPEAT_INTERVAL_MS;
}

/** Speaks `message` if `shouldSpeak` says it's due, updating `stateRef` in
 * place — shared by every capture screen (teeth-capture.tsx,
 * face-mesh-capture.tsx, posture-capture.tsx) so call sites don't each repeat
 * the shouldSpeak-then-update dance. */
export function speakGuidance(stateRef: { current: VoiceGuidanceState }, message: string, now: number): void {
  if (!shouldSpeak(stateRef.current, message, now)) return;
  stateRef.current = { lastMessage: message, lastSpokenAt: now };
  speak(message);
}
