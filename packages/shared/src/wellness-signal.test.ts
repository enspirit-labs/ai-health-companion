import { describe, expect, it } from 'vitest';

import { RISK_LEVELS } from './assessment-types';
import { WELLNESS_SIGNAL_LABELS } from './wellness-signal';

describe('WELLNESS_SIGNAL_LABELS', () => {
  it('maps every risk level to a wellness signal', () => {
    expect(WELLNESS_SIGNAL_LABELS).toEqual({
      LOW: 'On track',
      MODERATE: 'On track',
      ELEVATED: 'Worth a look',
      HIGH: 'Talk to someone',
    });
  });

  it('never uses risk, severity or abnormal wording', () => {
    for (const level of RISK_LEVELS) {
      expect(WELLNESS_SIGNAL_LABELS[level]).not.toMatch(/risk|high|elevated|moderate|low|critical|abnormal/i);
    }
  });
});
