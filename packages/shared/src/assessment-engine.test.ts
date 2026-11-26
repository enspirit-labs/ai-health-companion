import { describe, expect, it } from 'vitest';

import { AssessmentStateSchema, CaptureLabelSchema, StartAssessmentSchema } from './assessment-engine';

describe('StartAssessmentSchema', () => {
  it('parses without mode (backwards compat — every existing caller omits it)', () => {
    const result = StartAssessmentSchema.parse({ type: 'MENTAL_WELLNESS' });
    expect(result).toEqual({ type: 'MENTAL_WELLNESS' });
  });

  it('accepts an explicit mode', () => {
    const result = StartAssessmentSchema.parse({ type: 'MENTAL_WELLNESS', mode: 'PULSE' });
    expect(result.mode).toBe('PULSE');
  });

  it('rejects an unknown mode', () => {
    expect(() => StartAssessmentSchema.parse({ type: 'MENTAL_WELLNESS', mode: 'QUICK' })).toThrow();
  });
});

describe('AssessmentStateSchema', () => {
  const base = {
    id: '00000000-0000-0000-0000-000000000000',
    type: 'MENTAL_WELLNESS' as const,
    status: 'IN_PROGRESS' as const,
    inputMode: 'QUESTIONNAIRE' as const,
    questions: [],
    answers: {},
    nextQuestion: null,
    mediaAssets: [],
    testResults: {},
    isReadyToComplete: false,
  };

  it('parses without mode (backwards compat — no existing fixture needs updating)', () => {
    expect(() => AssessmentStateSchema.parse(base)).not.toThrow();
  });

  it('accepts an explicit mode', () => {
    const result = AssessmentStateSchema.parse({ ...base, mode: 'PULSE' });
    expect(result.mode).toBe('PULSE');
  });
});

describe('CaptureLabelSchema', () => {
  it.each(['front', 'left', 'center', 'reading', 'frame-0', 'frame-12', 'left-eye'])(
    'accepts the real capture label %s',
    (label) => {
      expect(CaptureLabelSchema.parse(label)).toBe(label);
    },
  );

  it('accepts an omitted label', () => {
    expect(CaptureLabelSchema.parse(undefined)).toBeUndefined();
  });

  it.each(['../../etc/passwd', '..', 'a/b', 'a\\b', 'front.jpg', 'Front', '', 'x'.repeat(33)])(
    'rejects %j',
    (label) => {
      expect(CaptureLabelSchema.safeParse(label).success).toBe(false);
    },
  );
});
