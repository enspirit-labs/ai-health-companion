/**
 * Pure decision logic that turns the live setup signals — lighting, body
 * framing, and facing direction — into the SINGLE most important thing to tell
 * the user right now. Kept dependency-free and separate from the component so
 * the priority order is unit-tested rather than buried in JSX / the rAF loop.
 *
 * This is guidance only: it never touches rep counting or motion detection.
 */

import type { LightingResult } from './lighting';
import type { PoseVisibilityResult } from './pose-visibility';
import type { FacingResult } from './facing-direction';
import type { PitchResult } from './camera-pitch';
import {
  ABSENT_CUE_KEY,
  ABSENT_HINT,
  CROWDED_CUE_KEY,
  CROWDED_HINT,
  type OccupancyResult,
} from './occupancy';

export interface GuidanceInputs {
  /** Null until a lighting sample has been taken. */
  lighting: LightingResult | null;
  regions: PoseVisibilityResult;
  facing: FacingResult;
  /** True once the squat session has started (some cues only apply pre-start). */
  started: boolean;
  /** Who's in frame. Optional so existing callers that don't track occupancy
   * keep working unchanged. */
  occupancy?: OccupancyResult;
  /** Camera up/down tilt, estimated from leg:torso proportions. Optional so
   * existing callers that don't track pitch keep working unchanged. */
  pitch?: PitchResult;
}

export interface GuidanceCue {
  /** Stable key for debounce/cooldown bookkeeping (same key = same cue). */
  key: string;
  /** Human-readable text for both the screen and voice. */
  text: string;
  /** True when nothing is wrong and the user can proceed. */
  ok: boolean;
}

/** Shown and spoken when the camera is angled down at the user (typically
 * mounted too high). Exported so the component and this module stay in sync
 * on the exact wording. */
export const PITCH_TOO_HIGH_HINT = 'Lower your camera a little so your legs are in view';
/** Shown and spoken when the camera is angled up at the user (typically
 * mounted too low). */
export const PITCH_TOO_LOW_HINT = 'Raise your camera a little so it faces you straight on';

const ALL_SET_STARTED: GuidanceCue = { key: 'ok-started', text: 'Looking good — keep going', ok: true };
const ALL_SET_READY: GuidanceCue = {
  key: 'ok-ready',
  text: 'Great — your whole body is in frame. Press start when you’re ready.',
  ok: true,
};

/**
 * Chooses the highest-priority guidance cue. Priority (most blocking first):
 *   0. Nobody in frame — every other signal is derived from a body we don't
 *      have, so there is nothing meaningful to coach until someone appears.
 *   1. Occupancy — a second person can hijack the tracker, so every other
 *      signal is measured against a possibly-wrong body until the frame clears.
 *   2. Lighting — if we can't see the user well, nothing else is trustworthy.
 *   3. Framing — body parts out of frame.
 *   4. Facing — turned away from the camera.
 *   5. Camera pitch — tilted too far up/down (mounting height/angle problem).
 *   6. All good.
 * Returns null only when there is genuinely nothing to say yet (e.g. no
 * lighting sample and a full, forward-facing pose pre-start would still yield
 * the "ready" cue, so null is rare — reserved for "no signal at all").
 */
export function chooseGuidanceCue(inputs: GuidanceInputs): GuidanceCue {
  const { lighting, regions, facing, started, occupancy, pitch } = inputs;

  // 0. Nobody detected. This must be checked FIRST, and specifically before
  // the framing rule below: with an empty frame every region reads as missing,
  // which would fire "Step back so your head, torso, arms, legs are visible" —
  // aimed at a person who isn't on camera at all, and pointing them the wrong
  // way. Invite them into view instead.
  //
  // Only consulted when the caller actually tracks occupancy; callers that
  // don't pass it keep their previous behaviour.
  if (occupancy && occupancy.personCount === 0) {
    return { key: ABSENT_CUE_KEY, text: ABSENT_HINT, ok: false };
  }

  // 1. Extra people outrank every other cue. The readings below describe
  // whichever body we picked as the subject, and that choice isn't reliable
  // while someone else is in shot — coaching lighting or framing off a
  // bystander's pose would actively mislead. Clear the frame first.
  if (occupancy?.crowded) {
    return { key: CROWDED_CUE_KEY, text: CROWDED_HINT, ok: false };
  }

  // 2. Lighting problems block everything else. Only too-dark / too-bright
  // reach here — unevenness is diagnostic only and never sets lighting.ok
  // false (see lighting.ts), so it can't produce a spoken cue.
  if (lighting && !lighting.ok && lighting.hint) {
    const key = lighting.tooDark ? 'light-dark' : 'light-bright';
    return { key, text: lighting.hint, ok: false };
  }

  // 3. Facing the camera — checked BEFORE the missing-regions check. A side/
  // back turn foreshortens the shoulders/hips/limbs so they read as "missing",
  // which would otherwise fire a misleading "step back" cue. If the torso is
  // tracked but the person isn't front-on, the real fix is to turn, not to
  // step back — so facing wins here.
  if (regions.torso && !facing.isFacingForward) {
    // NOTE: the camera feed is mirrored (selfie view), so the direction the
    // user needs to physically turn is the SAME side the detector reports —
    // detector 'left' → tell the user to turn to their left, and 'right' →
    // right. (An earlier non-mirrored assumption had these swapped, which told
    // users the opposite way.)
    const text =
      facing.direction === 'left'
        ? 'Turn to your left to face the camera'
        : facing.direction === 'right'
          ? 'Turn to your right to face the camera'
          : facing.direction === 'back'
            ? 'Turn around and face the camera'
            : 'Turn to face the camera straight on';
    return { key: `facing-${facing.direction}`, text, ok: false };
  }

  // 4b. Camera angled too far up/down. Checked BEFORE the missing-regions
  // check for the same reason facing is: an extreme pitch foreshortens the
  // legs (angled down) or exaggerates them out of frame (angled up), which
  // would otherwise misread as "step back" — but the real fix is to adjust
  // the camera's mounting height/angle, not the user's distance.
  if (regions.torso && pitch && !pitch.isLevelEnough) {
    const text = pitch.pitch === 'too-high' ? PITCH_TOO_HIGH_HINT : PITCH_TOO_LOW_HINT;
    return { key: `pitch-${pitch.pitch}`, text, ok: false };
  }

  // 4. Body parts out of frame (genuine framing issue, not a turn).
  if (regions.missing.length > 0) {
    const verb = regions.missing.length > 1 ? 'are' : 'is';
    return {
      key: `framing-${regions.missing.join('-')}`,
      text: `Step back so your ${regions.missing.join(', ')} ${verb} visible`,
      ok: false,
    };
  }

  // 5. All clear.
  return started ? ALL_SET_STARTED : ALL_SET_READY;
}
