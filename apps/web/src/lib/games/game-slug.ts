import { PULSE_GAME_TYPES, type PulseGameType } from '@aidoctor/shared';

/** Mirrors lib/assessments/type-slug.ts so game URLs read the same way assessment URLs do. */
const SLUG_TO_TYPE = new Map<string, PulseGameType>(
  PULSE_GAME_TYPES.map((type) => [type.toLowerCase().replace(/_/g, '-'), type]),
);

export function gameTypeFromSlug(slug: string): PulseGameType | null {
  return SLUG_TO_TYPE.get(slug) ?? null;
}

export function slugFromGameType(type: PulseGameType): string {
  return type.toLowerCase().replace(/_/g, '-');
}

export const GAME_LABELS: Record<PulseGameType, string> = {
  TANGO: 'Tango',
  PINPOINT: 'Pinpoint',
};

export const GAME_TAGLINES: Record<PulseGameType, string> = {
  TANGO: 'Fill the grid with suns and moons',
  PINPOINT: 'Guess the category from the clues',
};
