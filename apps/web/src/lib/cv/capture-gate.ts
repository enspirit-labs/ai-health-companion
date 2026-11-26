/** Generic smoothing + hold-to-capture gate for per-region detection results.
 * Shared by both the pose track (head/torso/arms/legs) and the face track
 * (eyes/eyebrows/mouth/jaw) — both are just `Record<string, boolean>` per
 * frame, so one tracker implementation covers either. */
export interface CaptureGateOptions {
  /** Rolling-window size, in inference ticks, used for the majority vote. */
  bufferSize?: number;
  /** Fraction of the buffer that must be `true` for a region to read "confirmed". */
  passRatio?: number;
  /** How long all required regions must stay simultaneously confirmed before capture is ready. */
  holdMs?: number;
}

export interface CaptureGateResult {
  /** Per-region result after the rolling-majority vote (this frame). */
  confirmed: Record<string, boolean>;
  /** Whether every required region is currently confirmed. */
  allRequiredConfirmed: boolean;
  /** Whether allRequiredConfirmed has held continuously for `holdMs`. */
  isReadyToCapture: boolean;
}

const DEFAULT_BUFFER_SIZE = 8;
const DEFAULT_PASS_RATIO = 0.7;
const DEFAULT_HOLD_MS = 500;

class RegionBuffer {
  private readonly samples: boolean[] = [];

  constructor(private readonly bufferSize: number) {}

  push(value: boolean): void {
    this.samples.push(value);
    if (this.samples.length > this.bufferSize) this.samples.shift();
  }

  /** Only confirms once the buffer has enough history — otherwise a couple of
   * lucky frames out of a half-full buffer could clear the pass ratio. */
  isConfirmed(passRatio: number): boolean {
    if (this.samples.length < this.bufferSize) return false;
    const passCount = this.samples.filter(Boolean).length;
    return passCount / this.samples.length >= passRatio;
  }

  /** Read-only copy of the current samples (oldest first) + the pass ratio
   * they compute — for temporary debug logging only, not used by
   * isConfirmed() itself. */
  debugSnapshot(): { samples: boolean[]; passRatio: number } {
    const passCount = this.samples.filter(Boolean).length;
    const passRatio = this.samples.length === 0 ? 0 : passCount / this.samples.length;
    return { samples: [...this.samples], passRatio };
  }
}

/** Tracks per-region smoothing and the continuous-hold condition that gates
 * a capture button. Instantiate once per capture screen (e.g. via useRef)
 * and call `update()` once per inference tick — not once per rAF tick, since
 * inference itself is already throttled below display frame rate. */
export class CaptureGateTracker {
  private readonly bufferSize: number;
  private readonly passRatio: number;
  private readonly holdMs: number;
  private readonly buffers = new Map<string, RegionBuffer>();
  private firstAllConfirmedAtMs: number | null = null;

  constructor(
    private readonly requiredRegions: string[],
    options: CaptureGateOptions = {},
  ) {
    this.bufferSize = options.bufferSize ?? DEFAULT_BUFFER_SIZE;
    this.passRatio = options.passRatio ?? DEFAULT_PASS_RATIO;
    this.holdMs = options.holdMs ?? DEFAULT_HOLD_MS;
  }

  update(rawRegions: Record<string, boolean>, nowMs: number): CaptureGateResult {
    const confirmed: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(rawRegions)) {
      let buffer = this.buffers.get(key);
      if (!buffer) {
        buffer = new RegionBuffer(this.bufferSize);
        this.buffers.set(key, buffer);
      }
      buffer.push(value);
      confirmed[key] = buffer.isConfirmed(this.passRatio);
    }

    const allRequiredConfirmed = this.requiredRegions.every((region) => confirmed[region] === true);

    if (allRequiredConfirmed) {
      if (this.firstAllConfirmedAtMs === null) this.firstAllConfirmedAtMs = nowMs;
    } else {
      this.firstAllConfirmedAtMs = null;
    }

    const isReadyToCapture =
      allRequiredConfirmed && this.firstAllConfirmedAtMs !== null && nowMs - this.firstAllConfirmedAtMs >= this.holdMs;

    return { confirmed, allRequiredConfirmed, isReadyToCapture };
  }

  /** Read-only introspection for a specific region's rolling buffer — the
   * raw samples (oldest first) and the pass ratio they currently compute.
   * Not used by `update()` itself; exists purely so callers can add
   * temporary console logging while tuning thresholds, e.g.
   * `gate.getDebugSnapshot('shouldersHipsOk')`. Returns null before that
   * region has ever been pushed to. */
  getDebugSnapshot(key: string): { samples: boolean[]; passRatio: number } | null {
    return this.buffers.get(key)?.debugSnapshot() ?? null;
  }
}

/** Fires `onReady` once when `isReadyToCapture` transitions to true, then
 * won't fire again until it drops back to false and returns — so a capture
 * screen using CaptureGateTracker (whose isReadyToCapture already IS "held
 * true continuously for holdMs") gets auto-capture for free, without a
 * second hold-timer layered on top. `firedRef` is caller-owned (component
 * lifetime, e.g. a useRef) so a retake can reset it. */
export function maybeAutoCapture(firedRef: { current: boolean }, isReadyToCapture: boolean, onReady: () => void): void {
  if (!isReadyToCapture) {
    firedRef.current = false;
    return;
  }
  if (firedRef.current) return;
  firedRef.current = true;
  onReady();
}
