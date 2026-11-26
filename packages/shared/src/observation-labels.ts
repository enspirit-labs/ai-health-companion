import type { AiObservation } from './ai-output';
import type { AssessmentType } from './assessment-types';

/**
 * Observation labels reach users verbatim (humanized, e.g. "darkCircles" →
 * "Dark circles"), so each module's AI prompt names a fixed set of
 * cosmetic / habit / self-care labels and anything the model returns outside
 * that set is dropped before it's stored. Interactive tests (Hand
 * Coordination, Memory, Squats) have no entry: their observations come from
 * client-scored numeric results rather than open-ended model inference, so
 * they pass through unfiltered.
 */
export const OBSERVATION_LABEL_ALLOWLISTS: Partial<Record<AssessmentType, readonly string[]>> = {
  FACE: [
    'skinTexture',
    'skinToneEvenness',
    'skinRedness',
    'darkCircles',
    'underEyePuffiness',
    'eyeOpenness',
    'restedAppearance',
    'facialSymmetry',
    'expressionSymmetry',
    'lipDryness',
  ],
  EYE: [
    'eyeMovementRange',
    'eyeRedness',
    'darkCircles',
    'underEyePuffiness',
    'eyeOpenness',
    'eyeTiredness',
    'screenComfort',
    'contrastSensitivity',
    'restedAppearance',
  ],
  TEETH: ['toothShade', 'surfaceStaining', 'stainPattern', 'smileAlignment', 'smileBrightness'],
  HAIR: [
    'hairVolume',
    'hairShine',
    'hairTexture',
    'frizz',
    'splitEnds',
    'breakage',
    'scalpFlaking',
    'scalpOiliness',
    'scalpDryness',
  ],
  SKIN: ['skinTexture', 'toneEvenness', 'dryness', 'oiliness', 'redness', 'visibleBlemishes', 'radiance'],
  TONGUE: ['tongueColour', 'surfaceCoating', 'tongueTexture', 'moisture'],
  VOICE: ['fluency', 'clarity', 'speechPace', 'coherence', 'energyTone', 'moodTone'],
  WALKING: ['walkingPace', 'strideConsistency', 'stepRhythm', 'walkingPosture', 'armSwing', 'sideToSideEvenness'],
  POSTURE: [
    'headForwardOfShoulders',
    'roundedShoulders',
    'unevenShoulderHeight',
    'headTilt',
    'slouching',
    'leaningToOneSide',
  ],
  LIFESTYLE: [
    'exerciseDaysPerWeek',
    'waterGlassesPerDay',
    'dietQuality',
    'smokes',
    'alcoholFrequency',
    'sleepHoursPerNight',
  ],
  MENTAL_WELLNESS: [
    'moodRating',
    'stressLevel',
    'sleepQuality',
    'socialConnection',
    'anxietyFrequency',
    'copingConfidence',
  ],
};

/** Case- and separator-insensitive, so "Dark circles" matches "darkCircles". */
function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Drops observations whose label isn't on the module's allowlist, rewriting
 * kept labels to the canonical allowlisted spelling. Modules without an
 * allowlist are returned unchanged.
 */
export function filterObservationsByAllowlist<T extends AiObservation>(
  type: AssessmentType,
  observations: readonly T[],
): T[] {
  const allowlist = OBSERVATION_LABEL_ALLOWLISTS[type];
  if (!allowlist) return [...observations];

  const canonical = new Map(allowlist.map((label) => [normalizeLabel(label), label]));
  const kept: T[] = [];
  for (const observation of observations) {
    const label = canonical.get(normalizeLabel(observation.label));
    if (label) kept.push({ ...observation, label });
  }
  return kept;
}
