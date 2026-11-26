import { formatAnswer } from './labels';
import type { HealthProfileRecord } from './use-health-profile';

const baseProfile: HealthProfileRecord = {
  id: 'profile-1',
  userId: 'user-1',
  age: 29,
  gender: 'FEMALE',
  heightCm: 165,
  weightKg: 60,
  bloodGroup: 'O_POS',
  exerciseLevel: 'MODERATE',
  dietType: 'OMNIVORE',
  sleepHours: 7.5,
  smoking: false,
  alcohol: true,
  existingConditions: [],
  medications: ['Vitamin D'],
  allergies: [],
  emergencyContactName: 'Alex Doe',
  emergencyContactRelationship: 'Spouse',
  emergencyContactPhone: '+15550001111',
  answeredQuestionKeys: [],
};

describe('formatAnswer', () => {
  it('formats numeric answers with units', () => {
    expect(formatAnswer('age', baseProfile)).toBe('29 years old');
    expect(formatAnswer('heightCm', baseProfile)).toBe('165 cm');
    expect(formatAnswer('sleepHours', baseProfile)).toBe('7.5 hours');
  });

  it('formats enum answers with human-readable labels', () => {
    expect(formatAnswer('gender', baseProfile)).toBe('Female');
    expect(formatAnswer('bloodGroup', baseProfile)).toBe('O+');
    expect(formatAnswer('dietType', baseProfile)).toBe('Omnivore');
  });

  it('formats booleans as Yes/No', () => {
    expect(formatAnswer('smoking', baseProfile)).toBe('No');
    expect(formatAnswer('alcohol', baseProfile)).toBe('Yes');
  });

  it('formats an empty list as "None"', () => {
    expect(formatAnswer('existingConditions', baseProfile)).toBe('None');
    expect(formatAnswer('medications', baseProfile)).toBe('Vitamin D');
  });

  it('formats the emergency contact as a single line', () => {
    expect(formatAnswer('emergencyContact', baseProfile)).toBe('Alex Doe (Spouse), +15550001111');
  });
});
