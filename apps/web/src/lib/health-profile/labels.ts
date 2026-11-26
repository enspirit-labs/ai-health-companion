import type { HealthProfileRecord } from './use-health-profile';

export const GENDER_LABELS: Record<string, string> = {
  MALE: 'Male',
  FEMALE: 'Female',
  NON_BINARY: 'Non-binary',
  PREFER_NOT_TO_SAY: 'Prefer not to say',
};

export const BLOOD_GROUP_LABELS: Record<string, string> = {
  A_POS: 'A+',
  A_NEG: 'A−',
  B_POS: 'B+',
  B_NEG: 'B−',
  AB_POS: 'AB+',
  AB_NEG: 'AB−',
  O_POS: 'O+',
  O_NEG: 'O−',
  UNKNOWN: "I don't know",
};

export const EXERCISE_LEVEL_LABELS: Record<string, string> = {
  SEDENTARY: 'Sedentary (little to no exercise)',
  LIGHT: 'Light (1-2 days/week)',
  MODERATE: 'Moderate (3-4 days/week)',
  ACTIVE: 'Active (5-6 days/week)',
  ATHLETE: 'Athlete (daily intense training)',
};

export const DIET_TYPE_LABELS: Record<string, string> = {
  OMNIVORE: 'Omnivore',
  VEGETARIAN: 'Vegetarian',
  VEGAN: 'Vegan',
  PESCATARIAN: 'Pescatarian',
  KETO: 'Keto',
  OTHER: 'Other',
};

function listOrNone(values: string[]): string {
  return values.length > 0 ? values.join(', ') : 'None';
}

export function formatAnswer(key: string, profile: HealthProfileRecord): string {
  switch (key) {
    case 'age':
      return `${profile.age} years old`;
    case 'gender':
      return GENDER_LABELS[profile.gender as string] ?? String(profile.gender);
    case 'heightCm':
      return `${profile.heightCm} cm`;
    case 'weightKg':
      return `${profile.weightKg} kg`;
    case 'bloodGroup':
      return BLOOD_GROUP_LABELS[profile.bloodGroup as string] ?? String(profile.bloodGroup);
    case 'exerciseLevel':
      return EXERCISE_LEVEL_LABELS[profile.exerciseLevel as string] ?? String(profile.exerciseLevel);
    case 'dietType':
      return DIET_TYPE_LABELS[profile.dietType as string] ?? String(profile.dietType);
    case 'sleepHours':
      return `${profile.sleepHours} hours`;
    case 'smoking':
      return profile.smoking ? 'Yes' : 'No';
    case 'alcohol':
      return profile.alcohol ? 'Yes' : 'No';
    case 'existingConditions':
      return listOrNone(profile.existingConditions as string[]);
    case 'medications':
      return listOrNone(profile.medications as string[]);
    case 'allergies':
      return listOrNone(profile.allergies as string[]);
    case 'emergencyContact':
      return `${profile.emergencyContactName} (${profile.emergencyContactRelationship}), ${profile.emergencyContactPhone}`;
    default:
      return '';
  }
}
