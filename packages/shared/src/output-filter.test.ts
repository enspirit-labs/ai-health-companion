import { describe, expect, it } from 'vitest';

import { CONDITION_TERMS } from './condition-terms';
import {
  OUTPUT_FILTER_FALLBACK,
  collectAssessmentText,
  fallbackAssessmentOutput,
  findConditionTerms,
  hasMedicationAdvice,
} from './output-filter';
import type { AiStructuredOutput } from './ai-output';

// Development cases written by the implementer (not the evaluation sets).
const CONDITION_LEAKS = [
  'This pattern can be a sign of anemia.',
  'You may have Gingivitis, so floss daily.',
  'Looks like early-stage ECZEMA on the cheek.',
  'Signs consistent with high-blood pressure',
  'Possible type 2 diabetes risk',
  'diabetic tendencies',
  'Several cavities are visible',
  'Mild scoliosis, perhaps',
  'You seem to be showing depression symptoms',
  'high   blood\npressure readings',
];

const CLEAN_TEXT = [
  'Your sleep looked a little short this week. A steady bedtime can help.',
  'Try a ten minute walk after lunch and drink water through the day.',
  'Your posture looked slightly rounded; a few shoulder stretches may help.',
  'Your cardiovascular score is steady.',
  'Skin looked a little dry, so moisturise and drink more water.',
  'The stroke of a pen and a swimming stroke are not conditions.',
  'Anxiety about work is common; slow breathing can help.',
];

describe('findConditionTerms', () => {
  it.each(CONDITION_LEAKS)('flags a condition name in %j', (text) => {
    expect(findConditionTerms(text)).not.toHaveLength(0);
  });

  it.each(CLEAN_TEXT)('lets %j through', (text) => {
    expect(findConditionTerms(text)).toEqual([]);
  });

  it('returns the matched term', () => {
    expect(findConditionTerms('a sign of anemia')).toEqual(['anemia']);
  });

  it('detects every term on the list', () => {
    for (const term of CONDITION_TERMS) {
      expect(findConditionTerms(`Might be ${term} here`)).toContain(term);
    }
  });

  it('does not flag a term inside a longer unrelated word', () => {
    expect(findConditionTerms('Tracking your acnecare routine is hardly required')).toEqual([]);
  });
});

describe('hasMedicationAdvice', () => {
  const BLOCKED = [
    'Take 500 mg of ibuprofen twice a day.',
    'You could increase your dose a little.',
    'I would stop taking your medication for a week.',
    'Try taking two tablets before bed.',
    'Skip your insulin tonight.',
    'Switch to a different painkiller.',
    'A daily aspirin may help.',
    'The usual dosage is 10ml',
    'Start taking supplements',
    'Double your antidepressants',
  ];
  const ALLOWED = [
    'A short walk after dinner can help you wind down.',
    'Aim for 8 glasses of water and about 30 g of fibre.',
    'Talk to your doctor or pharmacist about any medicines you use.',
    'Try to keep a regular sleep schedule.',
  ];

  it.each(BLOCKED)('blocks %j', (text) => {
    expect(hasMedicationAdvice(text)).toBe(true);
  });

  it.each(ALLOWED)('allows %j', (text) => {
    expect(hasMedicationAdvice(text)).toBe(false);
  });
});

describe('fixed fallback copy', () => {
  it('is itself free of condition names and medication advice', () => {
    const copy = [
      OUTPUT_FILTER_FALLBACK.chat,
      OUTPUT_FILTER_FALLBACK.summary,
      OUTPUT_FILTER_FALLBACK.observation.label,
      OUTPUT_FILTER_FALLBACK.observation.value,
      OUTPUT_FILTER_FALLBACK.recommendation.title,
      OUTPUT_FILTER_FALLBACK.recommendation.detail,
    ];
    for (const text of copy) {
      expect(findConditionTerms(text)).toEqual([]);
      expect(hasMedicationAdvice(text)).toBe(false);
    }
  });
});

describe('assessment helpers', () => {
  const output: AiStructuredOutput = {
    score: 61,
    observations: [{ label: 'Skin', value: 'Looks like eczema', severity: 'MODERATE' }],
    recommendations: [{ title: 'Moisturise', detail: 'Use a cream', priority: 'HIGH' }],
    riskLevel: 'MODERATE',
    confidence: 70,
    disclaimer: 'Not medical advice.',
  };

  it('collects every free-text field', () => {
    expect(collectAssessmentText(output)).toEqual([
      'Skin',
      'Looks like eczema',
      'Moisturise',
      'Use a cream',
      'Not medical advice.',
    ]);
  });

  it('keeps the numbers and replaces all text with clean fixed copy', () => {
    const fallback = fallbackAssessmentOutput(output);
    expect(fallback.score).toBe(61);
    expect(fallback.riskLevel).toBe('MODERATE');
    expect(fallback.confidence).toBe(70);
    for (const text of collectAssessmentText(fallback)) {
      expect(findConditionTerms(text)).toEqual([]);
    }
  });
});
