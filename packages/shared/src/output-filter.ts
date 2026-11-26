import { CONDITION_TERMS } from './condition-terms';
import type { AiStructuredOutput } from './ai-output';
import { WELLNESS_DISCLAIMER } from './constants';

/**
 * Deterministic filter for model-written text. Pure and
 * framework-free; the API provider decides what to do on a hit (regenerate
 * once, then fall back to the fixed copy below).
 */

/** Lowercases, strips accents and collapses everything non-alphanumeric to single spaces. */
function normalizeForFilter(text: string): string {
  return ` ${text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;
}

// Whole words, tolerating a plural or adjective ending ("diabetic", "cavities").
const CONDITION_PATTERNS: Array<{ term: string; pattern: RegExp }> = CONDITION_TERMS.map((term) => ({
  term,
  pattern: new RegExp(` ${term}(?:s|es|ic)? `),
}));

/** Condition names found in `text`, in list order. Empty when clean. */
export function findConditionTerms(text: string): string[] {
  const normalized = normalizeForFilter(text);
  return CONDITION_PATTERNS.filter(({ pattern }) => pattern.test(normalized)).map(({ term }) => term);
}

/**
 * Dosing and medication-change wording (E5). Checked on chat replies only: the
 * coach may talk about food, sleep and movement but never about what to take,
 * how much, or whether to stop. Patterns run on the normalised text.
 */
const MEDICATION_PATTERNS: RegExp[] = [
  // a quantity of a drug: "500 mg", "2 tablets", "10 ml", "5000 iu"
  / (?:\d+|one|two|three|four|five|six|ten|half a|a couple of)(?: \d+)? ?(?:mg|mcg|ug|ml|iu|tablets?|pills?|capsules?|drops|puffs|units) /,
  / (?:milligrams?|micrograms?|dosage|dosages|dose|doses|dosing|overdose|prescription|prescribed) /,
  / (?:stop|stopping|quit|skip|skipping|miss|pause|discontinue|discontinuing) (?:[a-z]+ ){0,3}(?:medication|medications|medicine|medicines|meds|pills?|tablets?|insulin|antibiotics?|statins?|inhaler) /,
  / (?:start|starting|begin|increase|increasing|raise|reduce|reducing|lower|lowering|double|doubling|halve|halving|change|changing|switch|switching|adjust|adjusting|take|taking) (?:[a-z]+ ){0,3}(?:medication|medications|medicine|medicines|meds|pills?|tablets?|insulin|antibiotics?|statins?|painkillers?|antidepressants?|supplements?) /,
  / (?:ibuprofen|paracetamol|acetaminophen|aspirin|metformin|insulin|antibiotics?|antidepressants?|statins?|benzodiazepines?|opioids?|steroids?) /,
];

/** True when `text` contains dosing or medication-change content. */
export function hasMedicationAdvice(text: string): boolean {
  const normalized = normalizeForFilter(text);
  return MEDICATION_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * Fixed fallbacks used when a regenerated answer still trips the filter.
 * needs clinician review
 */
export const OUTPUT_FILTER_FALLBACK = {
  chat: "I can't answer that one safely here. For anything about your health or anything you take, please talk to a doctor or pharmacist. I'm happy to help with sleep, movement, food, hydration and stress habits instead.",
  summary:
    'Your results are ready. Take a look at the scores and suggestions below, and talk to a doctor or pharmacist if anything is worrying you.',
  observation: { label: 'Overview', value: 'Detailed notes are not available for this check-in.' },
  recommendation: {
    title: 'Talk to a health professional',
    detail: 'If anything about your health is worrying you, a doctor or pharmacist is the right person to ask.',
  },
} as const;

/** Every free-text string in a scored assessment, for filtering. */
export function collectAssessmentText(output: AiStructuredOutput): string[] {
  return [
    ...output.observations.flatMap((o) => [o.label, o.value]),
    ...output.recommendations.flatMap((r) => [r.title, r.detail]),
    output.disclaimer,
  ];
}

/** Scores and levels are kept; every piece of free text is replaced with fixed copy. */
export function fallbackAssessmentOutput(output: AiStructuredOutput): AiStructuredOutput {
  return {
    ...output,
    observations: [{ ...OUTPUT_FILTER_FALLBACK.observation }],
    recommendations: [{ ...OUTPUT_FILTER_FALLBACK.recommendation, priority: 'MEDIUM' }],
    disclaimer: WELLNESS_DISCLAIMER,
  };
}
