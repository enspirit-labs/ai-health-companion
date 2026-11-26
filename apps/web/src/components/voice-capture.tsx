'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, RotateCcw, Square, Volume2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { MediaErrorState } from '@/components/media-error-state';
import { cn } from '@/lib/utils';
import { classifyMicLevel, rmsFromTimeDomain, type MicLevelResult } from '@/lib/media/mic-level';
import { microphoneErrorMessage, requestMicrophoneStream, type MediaAccessError } from '@/lib/media/user-media';
import { useSpeechCue } from '@/lib/voice/use-speech-cue';

interface Props {
  isSubmitting: boolean;
  onCapture: (blob: Blob) => void;
}

const MAX_DURATION_SECONDS = 30;
const READING_PASSAGE =
  '"The sun was warm on my face this morning, and I felt ready to take on the day. ' +
  'I made a cup of tea, checked in with a friend, and got started on my plans."';

const RECORDER_MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];

/** The pre-recording briefing, shown as text and spoken in the same order. Each
 * line is spoken as its own utterance so the on-screen list can highlight
 * whichever one is being read out. */
const INSTRUCTIONS = [
  'Find a quiet spot and hold your device about an arm’s length away.',
  'Speak louder than usual, and pronounce each word clearly.',
  'Read the whole passage at your normal pace — don’t rush it.',
] as const;

/** Spoken immediately before recording starts. */
const GO_LINE = 'Recording now — start reading.';

/** Level meter cadence. Fast enough to feel live, slow enough to be cheap. */
const LEVEL_INTERVAL_MS = 100;
/** Small FFT — we only need amplitude, not spectral detail. */
const ANALYSER_FFT_SIZE = 512;
/** Share of sampled frames a level problem must cover before the review screen
 * mentions it — a pause before the user starts reading isn't a problem. */
const SUSTAINED_LEVEL_SHARE = 0.5;

/** idle: waiting for the user's tap (browsers block TTS until a gesture).
 *  briefing: instructions being spoken; mic deliberately not recording yet.
 *  recording: capturing audio with a live level meter.
 *  review: listening back before submitting. */
type Flow = 'idle' | 'briefing' | 'recording' | 'review';

const NO_LEVEL: MicLevelResult = { verdict: 'silent', hint: null, meter: 0 };

function pickSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return RECORDER_MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
}

export function VoiceCapture({ isSubmitting, onCapture }: Props) {
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const levelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Web Audio graph for the live level meter, torn down with the stream.
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  // Guards against a briefing that's still speaking when the user leaves.
  const cancelledRef = useRef(false);
  // Level-problem tally across the recording, so the review note reflects a
  // sustained problem rather than the last sample taken (a natural pause before
  // the user starts reading would otherwise latch "I can't hear you").
  const levelTallyRef = useRef({ frames: 0, quiet: 0, loud: 0 });

  const [micError, setMicError] = useState<MediaAccessError | null>(null);
  const [micReady, setMicReady] = useState(false);
  const [flow, setFlow] = useState<Flow>('idle');
  const [spokenLine, setSpokenLine] = useState<number>(-1);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [level, setLevel] = useState<MicLevelResult>(NO_LEVEL);
  /** Worst level problem seen while recording, for the review screen. */
  const [levelWarning, setLevelWarning] = useState<string | null>(null);

  const voice = useSpeechCue();

  useEffect(() => {
    let cancelled = false;

    requestMicrophoneStream()
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setMicReady(true);
      })
      .catch((error: unknown) => {
        if (!cancelled) setMicError(microphoneErrorMessage(error));
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(
    () => () => {
      cancelledRef.current = true;
      if (timerRef.current) clearInterval(timerRef.current);
      if (levelTimerRef.current) clearInterval(levelTimerRef.current);
      void audioContextRef.current?.close();
      // Don't leave a half-spoken briefing playing after unmount.
      voice.stop();
    },
    // `voice.stop` is a stable useCallback; this is an unmount-only cleanup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const stopTimers = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (levelTimerRef.current) {
      clearInterval(levelTimerRef.current);
      levelTimerRef.current = null;
    }
  }, []);

  /** Attaches an analyser to the live mic stream and starts polling the level.
   * Best-effort: if Web Audio is unavailable the recording still works, just
   * without a meter. */
  const startLevelMeter = useCallback((stream: MediaStream) => {
    try {
      const AudioCtor: typeof AudioContext | undefined =
        window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return;

      const context = audioContextRef.current ?? new AudioCtor();
      audioContextRef.current = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = ANALYSER_FFT_SIZE;
      context.createMediaStreamSource(stream).connect(analyser);
      analyserRef.current = analyser;

      const samples = new Uint8Array(analyser.fftSize);
      levelTimerRef.current = setInterval(() => {
        const node = analyserRef.current;
        if (!node) return;
        node.getByteTimeDomainData(samples);
        const result = classifyMicLevel(rmsFromTimeDomain(samples));
        setLevel(result);
        // Level coaching stays VISUAL only while recording — speaking it would
        // play our own voice into the live microphone and pollute the very
        // sample being analyzed. That's also why the briefing is sequenced
        // before recording starts rather than spoken over it.
        const tally = levelTallyRef.current;
        tally.frames += 1;
        if (result.verdict === 'quiet' || result.verdict === 'silent') tally.quiet += 1;
        if (result.verdict === 'loud') tally.loud += 1;
      }, LEVEL_INTERVAL_MS);
    } catch {
      // Meter is a nice-to-have; never block recording on it.
    }
  }, []);

  const handleStop = useCallback(() => {
    recorderRef.current?.stop();
  }, []);

  const beginRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;

    chunksRef.current = [];
    setLevelWarning(null);
    setLevel(NO_LEVEL);
    levelTallyRef.current = { frames: 0, quiet: 0, loud: 0 };
    const mimeType = pickSupportedMimeType();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      setRecordedBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
      stopTimers();
      // Only report a level problem that dominated the recording.
      const { frames, quiet, loud } = levelTallyRef.current;
      if (frames > 0 && quiet / frames >= SUSTAINED_LEVEL_SHARE) {
        setLevelWarning('Your voice came through quietly');
      } else if (frames > 0 && loud / frames >= SUSTAINED_LEVEL_SHARE) {
        setLevelWarning('Your voice was loud enough to distort');
      }
      setFlow('review');
    };

    recorder.start();
    setFlow('recording');
    setElapsedSeconds(0);
    startLevelMeter(stream);

    timerRef.current = setInterval(() => {
      setElapsedSeconds((s) => {
        const next = s + 1;
        if (next >= MAX_DURATION_SECONDS) recorder.stop();
        return next;
      });
    }, 1000);
  }, [stopTimers, startLevelMeter]);

  /** Speaks the briefing line by line, THEN starts recording. Sequenced with
   * `sayAndWait` rather than fired in parallel: the instructions play through
   * the speaker, so recording during them would capture our own voice. */
  const runBriefing = useCallback(async () => {
    setFlow('briefing');
    for (let i = 0; i < INSTRUCTIONS.length; i += 1) {
      if (cancelledRef.current) return;
      setSpokenLine(i);
      await voice.sayAndWait(INSTRUCTIONS[i]);
    }
    if (cancelledRef.current) return;
    setSpokenLine(-1);
    await voice.sayAndWait(GO_LINE);
    if (cancelledRef.current) return;
    beginRecording();
  }, [voice, beginRecording]);

  /** The one required user gesture: unlocks TTS, then runs the briefing. */
  const handleBegin = useCallback(() => {
    cancelledRef.current = false;
    voice.enable();
    void runBriefing();
  }, [voice, runBriefing]);

  const handleSkipBriefing = useCallback(() => {
    voice.stop();
    setSpokenLine(-1);
    beginRecording();
  }, [voice, beginRecording]);

  const handleRetake = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setRecordedBlob(null);
    setElapsedSeconds(0);
    setLevel(NO_LEVEL);
    setLevelWarning(null);
    // The mic stream is kept alive through review (unlike the camera flows), so
    // a retake can start straight away without re-prompting for permission.
    if (streamRef.current) {
      beginRecording();
    } else {
      setFlow('idle');
    }
  }, [previewUrl, beginRecording]);

  if (micError) {
    return <MediaErrorState error={micError} />;
  }

  if (flow === 'review' && recordedBlob && previewUrl) {
    return (
      <div className="flex flex-col items-center gap-4">
        <p className="max-w-sm text-center text-sm text-muted-foreground">Listen back before submitting:</p>
        <audio src={previewUrl} controls className="w-full max-w-sm" />

        {levelWarning ? (
          <p className="max-w-sm text-center text-sm text-status-warning">
            {levelWarning}. Retake if it sounds unclear.
          </p>
        ) : null}

        <div className="flex gap-2">
          <Button variant="outline" disabled={isSubmitting} onClick={handleRetake}>
            <RotateCcw className="size-4" /> Retake
          </Button>
          <Button disabled={isSubmitting} onClick={() => onCapture(recordedBlob)}>
            {isSubmitting ? 'Uploading…' : 'Use this recording'}
          </Button>
        </div>
      </div>
    );
  }

  const briefing = flow === 'briefing';
  const recording = flow === 'recording';
  // Only nag about level once there's something to say and we're recording.
  const levelHint = recording ? level.hint : null;

  const statusText = !micReady
    ? 'Starting microphone…'
    : flow === 'idle'
      ? 'Tap below — I’ll read out the instructions first.'
      : briefing
        ? 'Listen to the instructions…'
        : levelHint
          ? levelHint
          : `Recording… ${elapsedSeconds}s / ${MAX_DURATION_SECONDS}s`;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Instructions — always visible as text, highlighted line-by-line while
          being spoken, so this works with the sound off too. */}
      <div className="w-full max-w-sm rounded-xl border bg-muted/50 px-4 py-3">
        <p className="text-sm font-medium">Before you start</p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {INSTRUCTIONS.map((line, index) => (
            <li
              key={line}
              className={cn(
                'flex gap-2 text-sm transition-colors',
                spokenLine === index ? 'font-medium text-foreground' : 'text-muted-foreground',
              )}
            >
              <span aria-hidden>{spokenLine === index ? '▸' : '•'}</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="w-full max-w-sm rounded-xl border bg-muted/50 px-4 py-3 text-center text-sm italic">
        Read the passage below out loud:
        <p className="mt-2 not-italic">{READING_PASSAGE}</p>
      </div>

      <div
        className={cn(
          'flex size-24 items-center justify-center rounded-full border-2 transition-colors',
          recording && levelHint
            ? 'border-status-warning bg-status-warning/10'
            : recording
              ? 'border-destructive bg-destructive/10'
              : 'border-dashed border-muted-foreground/40',
        )}
      >
        <Mic
          className={cn(
            'size-8',
            recording && levelHint ? 'text-status-warning' : recording ? 'text-destructive' : 'text-muted-foreground',
          )}
        />
      </div>

      {/* Live level meter — makes "speak louder" concrete rather than a hint the
          user can only guess at. */}
      {recording ? (
        <div className="w-full max-w-sm">
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
            role="meter"
            aria-label="Microphone level"
            aria-valuenow={Math.round(level.meter * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={cn(
                'h-full transition-[width] duration-100',
                level.verdict === 'good' ? 'bg-status-good' : 'bg-status-warning',
              )}
              style={{ width: `${Math.round(level.meter * 100)}%` }}
            />
          </div>
        </div>
      ) : null}

      <p
        className={cn(
          'max-w-sm text-center text-sm',
          levelHint ? 'font-medium text-status-warning' : 'text-muted-foreground',
        )}
      >
        {statusText}
      </p>

      {flow === 'idle' ? (
        <Button disabled={!micReady} onClick={handleBegin}>
          <Volume2 className="size-4" /> {micReady ? 'Play instructions & start' : 'Preparing…'}
        </Button>
      ) : briefing ? (
        <Button variant="outline" onClick={handleSkipBriefing}>
          Skip to recording
        </Button>
      ) : (
        <Button variant="destructive" onClick={handleStop}>
          <Square className="size-4" /> Stop recording
        </Button>
      )}
    </div>
  );
}
