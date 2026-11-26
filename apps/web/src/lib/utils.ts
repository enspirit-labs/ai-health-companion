import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * "facialSymmetry" / "dark_circles" -> "Facial symmetry" — AI-generated
 * observation labels mirror whatever key shape the input data happened to
 * use (camelCase, snake_case), not guaranteed human-readable prose. This is
 * a display-time guardrail, not a substitute for prompting the AI to return
 * cleaner labels in the first place.
 */
export function humanizeLabel(label: string): string {
  const spaced = label
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  if (!spaced) return spaced;
  const lower = spaced.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
