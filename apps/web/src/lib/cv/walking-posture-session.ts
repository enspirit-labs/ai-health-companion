import { type WalkingFaultKind, type WalkingPostureResult } from './walking-posture';

/**
 * Accumulates per-frame walking-posture verdicts across a recording into a
 * stable summary. A single bad frame mid-stride means nothing; a fault present
 * across a large share of frames is a real finding — so this tracks how
 * PERSISTENT each fault was rather than whether it ever occurred.
 *
 * Pure and immutable (same shape as squat-rep-counter.ts): the caller keeps the
 * state in a ref and replaces it each frame.
 */

export interface WalkingSessionState {
  /** Frames where the torso was measurable — the denominator for all shares. */
  measuredFrames: number;
  /** Per-fault count of measured frames the fault appeared in. */
  faultFrames: Record<WalkingFaultKind, number>;
  /** Running total of per-frame scores, for the mean. */
  scoreTotal: number;
}

export const INITIAL_WALKING_SESSION_STATE: WalkingSessionState = {
  measuredFrames: 0,
  faultFrames: {
    'shoulder-tilt': 0,
    'hip-drop': 0,
    'lateral-lean': 0,
    'head-forward': 0,
    'trunk-flexion': 0,
  },
  scoreTotal: 0,
};

/** A fault must appear in at least this share of measured frames to make the
 * summary — filters out transient mid-stride artefacts. */
export const PERSISTENT_FAULT_SHARE = 0.25;

export interface WalkingSessionSummary {
  /** Mean per-frame posture score, 0–100. 0 when nothing was measurable. */
  postureScore: number;
  /** Faults that persisted past PERSISTENT_FAULT_SHARE, worst first. */
  persistentFaults: { kind: WalkingFaultKind; share: number }[];
  measuredFrames: number;
  rating: 'good' | 'fair' | 'poor' | 'inconclusive';
}

export function updateWalkingSession(
  state: WalkingSessionState,
  frame: WalkingPostureResult,
): WalkingSessionState {
  if (!frame.measured) return state;

  const faultFrames = { ...state.faultFrames };
  for (const fault of frame.faults) {
    faultFrames[fault.kind] += 1;
  }

  return {
    measuredFrames: state.measuredFrames + 1,
    faultFrames,
    scoreTotal: state.scoreTotal + frame.score,
  };
}

export function summarizeWalkingSession(state: WalkingSessionState): WalkingSessionSummary {
  if (state.measuredFrames === 0) {
    return { postureScore: 0, persistentFaults: [], measuredFrames: 0, rating: 'inconclusive' };
  }

  const postureScore = Math.round(state.scoreTotal / state.measuredFrames);
  const persistentFaults = (Object.entries(state.faultFrames) as [WalkingFaultKind, number][])
    .map(([kind, count]) => ({ kind, share: count / state.measuredFrames }))
    .filter((f) => f.share >= PERSISTENT_FAULT_SHARE)
    .sort((a, b) => b.share - a.share);

  // A mild fault can persist through most of the walk and still average a
  // high score, so persistence caps the rating independently: anything
  // sustained that long is a real finding, not frame noise.
  const scoreRating = postureScore >= 80 ? 'good' : postureScore >= 55 ? 'fair' : 'poor';
  const rating = persistentFaults.length > 0 && scoreRating === 'good' ? 'fair' : scoreRating;

  return { postureScore, persistentFaults, measuredFrames: state.measuredFrames, rating };
}
