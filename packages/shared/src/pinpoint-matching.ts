/**
 * Pinpoint's answer is a category *phrase* ("Words that come before price"),
 * not a single token, so demanding an exact string match would fail almost
 * every reasonable guess ("things before price", "___ price"). These helpers
 * score a guess 0..1 so the game can accept close paraphrases and show the
 * player how near they were on each attempt.
 */

/** Words carrying no categorising signal — dropped before comparing. */
const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'come',
  'comes',
  'for',
  'from',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'to',
  'with',
  'word',
  'words',
  'thing',
  'things',
  'type',
  'types',
  'kind',
  'kinds',
]);

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Crude but predictable singularisation so "prices" matches "price". */
function stem(token: string): string {
  if (token.length > 3 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 3 && token.endsWith('es')) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1);
  return token;
}

function contentTokens(value: string): string[] {
  return normalize(value)
    .split(' ')
    .filter(Boolean)
    // A keyed word ("before 'fall'") would otherwise keep its quotes as part
    // of the token, so it could never match a bare guess of "fall".
    .map((token) => token.replace(/^['-]+|['-]+$/g, ''))
    .filter(Boolean)
    .filter((token) => !STOP_WORDS.has(token))
    .map(stem);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

function characterSimilarity(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - levenshtein(a, b) / longest;
}

/**
 * Token-overlap similarity, measured against whichever side has fewer content
 * words. A guess of "price" against "words that come before price" should read
 * as a strong partial match (it found the key term) rather than being punished
 * for brevity.
 */
function tokenOverlap(guessTokens: string[], answerTokens: string[]): number {
  if (!guessTokens.length || !answerTokens.length) return 0;

  const answerSet = new Set(answerTokens);
  let matched = 0;
  for (const token of new Set(guessTokens)) {
    if (answerSet.has(token)) {
      matched += 1;
      continue;
    }
    // Near-miss on an individual word still counts (e.g. "colour"/"color").
    const fuzzy = answerTokens.some((answerToken) => characterSimilarity(token, answerToken) >= 0.8);
    if (fuzzy) matched += 1;
  }

  const denominator = Math.min(new Set(guessTokens).size, answerSet.size);
  return matched / denominator;
}

/**
 * 0..1 closeness of a guess to the real category. Blends whole-string
 * similarity with content-word overlap, then takes the more generous of the
 * two — the player deserves credit for finding the right idea in different
 * words, which is the whole skill the game tests.
 */
export function scorePinpointGuess(guess: string, category: string): number {
  const normalizedGuess = normalize(guess);
  const normalizedCategory = normalize(category);
  if (!normalizedGuess) return 0;
  if (normalizedGuess === normalizedCategory) return 1;

  const overlap = tokenOverlap(contentTokens(guess), contentTokens(category));
  const whole = characterSimilarity(normalizedGuess, normalizedCategory);

  return Math.min(1, Math.max(overlap, whole));
}

/** Whole-percent form used for the LinkedIn-style per-guess "% match" readout. */
export function pinpointMatchPercent(guess: string, category: string): number {
  return Math.round(scorePinpointGuess(guess, category) * 100);
}

/**
 * Accept threshold. Set at 0.7 so a guess that captures the category's
 * distinguishing words lands, while a merely thematically-adjacent guess
 * still costs an attempt.
 *
 * Known ceiling: this is lexical, so a pure synonym swap ("things that
 * *precede* price" vs "words that *come before* price") scores as a partial
 * match and is not accepted — see pinpoint-matching.test.ts. Closing that gap
 * needs embeddings, or an LLM adjudication pass on scores in the 0.45-0.7
 * band. Deliberately left out here: it would put a model call on the wrong-
 * guess path, and the generated categories are short and concrete enough that
 * the lexical score carries most cases.
 */
export const PINPOINT_ACCEPT_THRESHOLD = 0.7;

export function isPinpointGuessCorrect(guess: string, category: string): boolean {
  return scorePinpointGuess(guess, category) >= PINPOINT_ACCEPT_THRESHOLD;
}

export interface PinpointAnswerShape {
  wordCount: number;
  /** First letter of each word, uppercased — enough to orient without solving it. */
  initials: string[];
  /** Per-word blanks, e.g. ["W····", "T···"], preserving length as a nudge. */
  masked: string[];
}

/**
 * Skeleton of the answer, used by the hint tiers. Derived from the answer
 * string rather than asking the model for a separate hint field — nothing extra
 * to generate, so nothing extra to go wrong.
 *
 * Note the caller decides *how much* of this to show: revealing every initial
 * of a long phrase ("W T C B F" for "Words that come before fall") is close to
 * handing over the answer, so that's reserved for the last-resort tier.
 */
export function pinpointAnswerShape(category: string): PinpointAnswerShape {
  const words = normalize(category)
    .split(' ')
    // Quotes around a keyed word ("before 'fall'") would otherwise become the
    // word's "initial", showing a stray ' instead of a letter.
    .map((word) => word.replace(/^['-]+|['-]+$/g, ''))
    .filter(Boolean);

  return {
    wordCount: words.length,
    initials: words.map((word) => word[0].toUpperCase()),
    masked: words.map((word) => word[0].toUpperCase() + '·'.repeat(Math.max(0, word.length - 1))),
  };
}
