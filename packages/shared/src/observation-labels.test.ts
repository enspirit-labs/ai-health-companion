import { describe, expect, it } from 'vitest';

import { filterObservationsByAllowlist, OBSERVATION_LABEL_ALLOWLISTS } from './observation-labels';

describe('filterObservationsByAllowlist', () => {
  it('drops labels that are not on the module allowlist', () => {
    const result = filterObservationsByAllowlist('FACE', [
      { label: 'darkCircles', value: 'Mild' },
      { label: 'stressLevel', value: 'High' },
      { label: 'hydrationLevel', value: 'Low' },
    ]);

    expect(result).toEqual([{ label: 'darkCircles', value: 'Mild' }]);
  });

  it('matches labels case- and separator-insensitively and returns the canonical spelling', () => {
    const result = filterObservationsByAllowlist('POSTURE', [
      { label: 'Rounded shoulders', value: 'Slight', severity: 'LOW' },
      { label: 'head_forward_of_shoulders', value: 'Mild' },
    ]);

    expect(result).toEqual([
      { label: 'roundedShoulders', value: 'Slight', severity: 'LOW' },
      { label: 'headForwardOfShoulders', value: 'Mild' },
    ]);
  });

  it('drops condition-style labels for teeth, hair, skin and posture', () => {
    expect(filterObservationsByAllowlist('TEETH', [{ label: 'plaque', value: 'Visible' }])).toEqual([]);
    expect(filterObservationsByAllowlist('TEETH', [{ label: 'gumInflammation', value: 'Mild' }])).toEqual([]);
    expect(filterObservationsByAllowlist('HAIR', [{ label: 'hairLossPattern', value: 'Receding' }])).toEqual([]);
    expect(filterObservationsByAllowlist('SKIN', [{ label: 'acne', value: 'Moderate' }])).toEqual([]);
    expect(filterObservationsByAllowlist('POSTURE', [{ label: 'thoracicKyphosis', value: 'Mild' }])).toEqual([]);
  });

  it('passes observations through unchanged for a module without an allowlist', () => {
    const observations = [{ label: 'accuracy', value: '91%' }];

    expect(filterObservationsByAllowlist('HAND_COORDINATION', observations)).toEqual(observations);
  });

  it('does not mutate the input array', () => {
    const observations = [{ label: 'Dark circles', value: 'Mild' }];
    filterObservationsByAllowlist('FACE', observations);

    expect(observations).toEqual([{ label: 'Dark circles', value: 'Mild' }]);
  });
});

describe('OBSERVATION_LABEL_ALLOWLISTS', () => {
  it.each(['FACE', 'EYE', 'TEETH', 'HAIR', 'SKIN', 'TONGUE', 'VOICE', 'WALKING', 'POSTURE'] as const)(
    'has a %s allowlist with no condition or diagnostic wording',
    (type) => {
      const banned = /stress|hydration|plaque|gum|acne|pigment|kyphosis|lordosis|pelvic|spine|loss|thinning|balance|gait|diagnos|disease/i;
      const labels = OBSERVATION_LABEL_ALLOWLISTS[type] ?? [];

      expect(labels.length).toBeGreaterThan(0);
      for (const label of labels) expect(label).not.toMatch(banned);
    },
  );
});
