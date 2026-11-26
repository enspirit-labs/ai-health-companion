import { chooseGuidanceCue, PITCH_TOO_HIGH_HINT, PITCH_TOO_LOW_HINT } from './guidance-cue';
import type { LightingResult } from './lighting';
import type { PoseVisibilityResult } from './pose-visibility';
import type { FacingResult } from './facing-direction';
import type { PitchResult } from './camera-pitch';
import { ABSENT_CUE_KEY, ABSENT_HINT, CROWDED_CUE_KEY, EMPTY_OCCUPANCY, type OccupancyResult } from './occupancy';

const ALONE: OccupancyResult = { personCount: 1, primaryIndex: 0, primary: [], crowded: false };
const CROWDED: OccupancyResult = { personCount: 2, primaryIndex: 0, primary: [], crowded: true };

const GOOD_LIGHT: LightingResult = {
  brightness: 140,
  unevenness: 20,
  tooDark: false,
  tooBright: false,
  uneven: false,
  ok: true,
  hint: null,
};
const DARK_LIGHT: LightingResult = {
  brightness: 20,
  unevenness: 10,
  tooDark: true,
  tooBright: false,
  uneven: false,
  ok: false,
  hint: 'Too dark to see you — move somewhere brighter',
};

const ALL_VISIBLE: PoseVisibilityResult = { head: true, torso: true, arms: true, legs: true, missing: [] };
const LEGS_MISSING: PoseVisibilityResult = {
  head: true,
  torso: true,
  arms: true,
  legs: false,
  missing: ['legs'],
};

const FORWARD: FacingResult = { direction: 'forward', isFacingForward: true };
const TURNED_LEFT: FacingResult = { direction: 'left', isFacingForward: false };

const LEVEL_PITCH: PitchResult = { pitch: 'level', isLevelEnough: true };
const TOO_HIGH_PITCH: PitchResult = { pitch: 'too-high', isLevelEnough: false };
const TOO_LOW_PITCH: PitchResult = { pitch: 'too-low', isLevelEnough: false };

describe('chooseGuidanceCue', () => {
  // An empty frame makes every body region read as "missing", which used to
  // fire the framing cue and tell an absent user to "step back" — both
  // confusing and the wrong direction.
  it('asks an absent user to step into frame rather than to step back', () => {
    const cue = chooseGuidanceCue({
      lighting: GOOD_LIGHT,
      // What the detector actually reports with nobody there.
      regions: { head: false, torso: false, arms: false, legs: false, missing: ['head', 'torso', 'arms', 'legs'] },
      facing: { direction: 'unknown', isFacingForward: false },
      started: false,
      occupancy: EMPTY_OCCUPANCY,
    });

    expect(cue.key).toBe(ABSENT_CUE_KEY);
    expect(cue.text).toBe(ABSENT_HINT);
    expect(cue.ok).toBe(false);
    expect(cue.text).not.toMatch(/step back/i);
  });

  it('prioritizes an empty frame over lighting, framing and facing cues', () => {
    // Every one of these would otherwise produce its own cue — but they all
    // describe a body that isn't there.
    const cue = chooseGuidanceCue({
      lighting: DARK_LIGHT,
      regions: LEGS_MISSING,
      facing: TURNED_LEFT,
      started: true,
      occupancy: EMPTY_OCCUPANCY,
    });

    expect(cue.key).toBe(ABSENT_CUE_KEY);
  });

  it('keeps coaching normally once someone is in frame', () => {
    // Guards the absent check against firing on a present user.
    const cue = chooseGuidanceCue({
      lighting: GOOD_LIGHT,
      regions: LEGS_MISSING,
      facing: FORWARD,
      started: false,
      occupancy: ALONE,
    });

    expect(cue.key).not.toBe(ABSENT_CUE_KEY);
    expect(cue.text).toMatch(/step back/i);
  });

  it('prioritizes extra people over every other cue', () => {
    // With a bystander in shot the readings may describe the wrong body, so
    // coaching lighting/framing/facing off them would mislead the user.
    const cue = chooseGuidanceCue({
      lighting: DARK_LIGHT,
      regions: LEGS_MISSING,
      facing: TURNED_LEFT,
      started: false,
      occupancy: CROWDED,
    });
    expect(cue.ok).toBe(false);
    expect(cue.key).toBe(CROWDED_CUE_KEY);
    expect(cue.text).toMatch(/one person/i);
  });

  it('warns about extra people mid-session too, not just during setup', () => {
    const cue = chooseGuidanceCue({
      lighting: GOOD_LIGHT,
      regions: ALL_VISIBLE,
      facing: FORWARD,
      started: true,
      occupancy: CROWDED,
    });
    expect(cue.ok).toBe(false);
    expect(cue.key).toBe(CROWDED_CUE_KEY);
  });

  it('gives the normal ready cue once the frame holds only one person', () => {
    const cue = chooseGuidanceCue({
      lighting: GOOD_LIGHT,
      regions: ALL_VISIBLE,
      facing: FORWARD,
      started: false,
      occupancy: ALONE,
    });
    expect(cue.ok).toBe(true);
    expect(cue.key).toBe('ok-ready');
  });

  it('does not raise a crowding cue for an empty frame', () => {
    // Nobody detected is the opposite of crowded. It now gets its own "come
    // into frame" cue rather than the framing cue this once expected — an
    // absent user can't act on "step back".
    const cue = chooseGuidanceCue({
      lighting: GOOD_LIGHT,
      regions: LEGS_MISSING,
      facing: FORWARD,
      started: false,
      occupancy: EMPTY_OCCUPANCY,
    });
    expect(cue.key).not.toBe(CROWDED_CUE_KEY);
    expect(cue.key).toBe(ABSENT_CUE_KEY);
  });

  it('behaves exactly as before when no occupancy signal is supplied', () => {
    // The field is optional so existing callers keep working unchanged.
    const cue = chooseGuidanceCue({ lighting: DARK_LIGHT, regions: ALL_VISIBLE, facing: FORWARD, started: false });
    expect(cue.key).toBe('light-dark');
  });

  it('prioritizes lighting over framing and facing', () => {
    const cue = chooseGuidanceCue({ lighting: DARK_LIGHT, regions: LEGS_MISSING, facing: TURNED_LEFT, started: false });
    expect(cue.ok).toBe(false);
    expect(cue.text).toMatch(/bright/i);
    expect(cue.key).toBe('light-dark');
  });

  it('asks the user to step back when a region is out of frame and they ARE facing forward', () => {
    // Framing only applies when facing is fine — a turn foreshortens limbs and
    // would otherwise masquerade as a framing problem.
    const cue = chooseGuidanceCue({ lighting: GOOD_LIGHT, regions: LEGS_MISSING, facing: FORWARD, started: false });
    expect(cue.ok).toBe(false);
    expect(cue.text).toMatch(/legs/i);
    expect(cue.key).toContain('framing');
  });

  it('coaches turning BEFORE stepping back when the user is turned (turn masks framing)', () => {
    // Regression: a side turn drops limb visibility → LEGS_MISSING, but the real
    // fix is to turn, so facing must win over the framing "step back" cue.
    const cue = chooseGuidanceCue({ lighting: GOOD_LIGHT, regions: LEGS_MISSING, facing: TURNED_LEFT, started: false });
    expect(cue.ok).toBe(false);
    expect(cue.text).toMatch(/turn.*left/i);
    expect(cue.key).toContain('facing');
  });

  it('coaches a facing direction when framing is fine but turned', () => {
    const cue = chooseGuidanceCue({ lighting: GOOD_LIGHT, regions: ALL_VISIBLE, facing: TURNED_LEFT, started: false });
    expect(cue.ok).toBe(false);
    // Mirrored feed: detector 'left' → tell the user to turn to their left.
    expect(cue.text).toMatch(/turn.*left/i);
  });

  it('returns a ready cue when all is well pre-start', () => {
    const cue = chooseGuidanceCue({ lighting: GOOD_LIGHT, regions: ALL_VISIBLE, facing: FORWARD, started: false });
    expect(cue.ok).toBe(true);
    expect(cue.key).toBe('ok-ready');
  });

  it('returns the started cue when all is well during a session', () => {
    const cue = chooseGuidanceCue({ lighting: GOOD_LIGHT, regions: ALL_VISIBLE, facing: FORWARD, started: true });
    expect(cue.ok).toBe(true);
    expect(cue.key).toBe('ok-started');
  });

  it('does not raise a facing cue when the torso is not even tracked yet', () => {
    const noTorso: PoseVisibilityResult = { head: false, torso: false, arms: false, legs: false, missing: ['head', 'torso', 'arms', 'legs'] };
    const cue = chooseGuidanceCue({ lighting: GOOD_LIGHT, regions: noTorso, facing: TURNED_LEFT, started: false });
    // Framing takes precedence; the facing branch is skipped without a torso.
    expect(cue.key).toContain('framing');
  });

  it('treats a null lighting sample as no lighting problem yet', () => {
    const cue = chooseGuidanceCue({ lighting: null, regions: ALL_VISIBLE, facing: FORWARD, started: false });
    expect(cue.ok).toBe(true);
  });

  it('coaches lowering the camera when pitched too high', () => {
    const cue = chooseGuidanceCue({
      lighting: GOOD_LIGHT,
      regions: ALL_VISIBLE,
      facing: FORWARD,
      started: false,
      pitch: TOO_HIGH_PITCH,
    });
    expect(cue.ok).toBe(false);
    expect(cue.key).toBe('pitch-too-high');
    expect(cue.text).toBe(PITCH_TOO_HIGH_HINT);
  });

  it('coaches raising the camera when pitched too low', () => {
    const cue = chooseGuidanceCue({
      lighting: GOOD_LIGHT,
      regions: ALL_VISIBLE,
      facing: FORWARD,
      started: false,
      pitch: TOO_LOW_PITCH,
    });
    expect(cue.ok).toBe(false);
    expect(cue.key).toBe('pitch-too-low');
    expect(cue.text).toBe(PITCH_TOO_LOW_HINT);
  });

  it('prioritizes facing over pitch when both are off', () => {
    // A turn also distorts leg:torso proportions, so its cue isn't reliable
    // either — but facing is the more fundamental fix and must win.
    const cue = chooseGuidanceCue({
      lighting: GOOD_LIGHT,
      regions: ALL_VISIBLE,
      facing: TURNED_LEFT,
      started: false,
      pitch: TOO_HIGH_PITCH,
    });
    expect(cue.key).toContain('facing');
  });

  it('prioritizes missing regions from pitch over the pitch cue when torso is not tracked', () => {
    const noTorso: PoseVisibilityResult = { head: false, torso: false, arms: false, legs: false, missing: ['head', 'torso', 'arms', 'legs'] };
    const cue = chooseGuidanceCue({
      lighting: GOOD_LIGHT,
      regions: noTorso,
      facing: FORWARD,
      started: false,
      pitch: TOO_HIGH_PITCH,
    });
    expect(cue.key).toContain('framing');
  });

  it('prioritizes pitch over a genuine framing gap caused by that same tilt', () => {
    const legsMissing: PoseVisibilityResult = { head: true, torso: true, arms: true, legs: false, missing: ['legs'] };
    const cue = chooseGuidanceCue({
      lighting: GOOD_LIGHT,
      regions: legsMissing,
      facing: FORWARD,
      started: false,
      pitch: TOO_HIGH_PITCH,
    });
    expect(cue.key).toBe('pitch-too-high');
  });

  it('behaves as before when pitch is level', () => {
    const cue = chooseGuidanceCue({
      lighting: GOOD_LIGHT,
      regions: ALL_VISIBLE,
      facing: FORWARD,
      started: false,
      pitch: LEVEL_PITCH,
    });
    expect(cue.ok).toBe(true);
    expect(cue.key).toBe('ok-ready');
  });

  it('behaves exactly as before when no pitch signal is supplied', () => {
    const cue = chooseGuidanceCue({ lighting: GOOD_LIGHT, regions: ALL_VISIBLE, facing: FORWARD, started: false });
    expect(cue.ok).toBe(true);
    expect(cue.key).toBe('ok-ready');
  });
});
