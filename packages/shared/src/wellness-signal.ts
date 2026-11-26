import type { RiskLevel } from './assessment-types';

/**
 * What the user sees for each RiskLevel. The enum (and its DB column) keep
 * their names; on screen and in PDFs a result is a wellness signal, never a
 * risk grade or an "abnormal" flag. LOW and MODERATE share "On track": a
 * mid-range wellness score isn't something to act on, and giving it its own
 * band would invite reading it as a warning.
 */
export const WELLNESS_SIGNAL_LABELS: Record<RiskLevel, string> = {
  LOW: 'On track',
  MODERATE: 'On track',
  ELEVATED: 'Worth a look',
  HIGH: 'Talk to someone',
};
