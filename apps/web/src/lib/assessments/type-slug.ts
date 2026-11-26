import { ASSESSMENT_TYPES, type AssessmentType } from '@aidoctor/shared';

const SLUG_TO_TYPE = new Map<string, AssessmentType>(
  ASSESSMENT_TYPES.map((type) => [type.toLowerCase().replace(/_/g, '-'), type]),
);

export function assessmentTypeFromSlug(slug: string): AssessmentType | null {
  return SLUG_TO_TYPE.get(slug) ?? null;
}

export function slugFromAssessmentType(type: AssessmentType): string {
  return type.toLowerCase().replace(/_/g, '-');
}
