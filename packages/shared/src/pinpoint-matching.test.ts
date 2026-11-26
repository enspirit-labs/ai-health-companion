import { describe, expect, it } from 'vitest';

import {
  isPinpointGuessCorrect,
  pinpointAnswerShape,
  pinpointMatchPercent,
  scorePinpointGuess,
} from './pinpoint-matching';

const CATEGORY = 'Words that come before price';

describe('scorePinpointGuess', () => {
  it('scores an exact match as 1', () => {
    expect(scorePinpointGuess(CATEGORY, CATEGORY)).toBe(1);
  });

  it('ignores case, punctuation and surrounding whitespace', () => {
    expect(scorePinpointGuess('  words that come BEFORE "price"!  ', CATEGORY)).toBe(1);
  });

  it('scores an empty guess as 0', () => {
    expect(scorePinpointGuess('   ', CATEGORY)).toBe(0);
  });

  it('gives full credit for a paraphrase that keeps the key term', () => {
    // "words"/"that"/"come"/"before" are stop-words here, so "price" is the
    // whole signal — finding it is finding the category.
    expect(scorePinpointGuess('price', CATEGORY)).toBe(1);
  });

  it('accepts a reworded guess that keeps the answer wording', () => {
    expect(scorePinpointGuess('words before price', CATEGORY)).toBeGreaterThanOrEqual(0.7);
  });

  /**
   * Documents a known ceiling of lexical matching rather than asserting a fix:
   * "precede" and "before" mean the same thing but share no characters, so this
   * lands as a partial match. Closing that gap needs embeddings (or an LLM
   * adjudication pass on borderline guesses) — see the note in the module.
   */
  it('only partially credits a pure-synonym rewording (known limitation)', () => {
    const score = scorePinpointGuess('things that precede price', CATEGORY);
    expect(score).toBeGreaterThan(0.4);
    expect(score).toBeLessThan(0.7);
  });

  it('tolerates a small typo in the key word', () => {
    expect(scorePinpointGuess('pricee', CATEGORY)).toBeGreaterThanOrEqual(0.7);
  });

  it('handles plural/singular differences', () => {
    expect(scorePinpointGuess('prices', CATEGORY)).toBeGreaterThanOrEqual(0.7);
  });

  it('scores an unrelated guess low', () => {
    expect(scorePinpointGuess('types of fruit', CATEGORY)).toBeLessThan(0.7);
  });

  it('never exceeds 1', () => {
    expect(scorePinpointGuess('price price price', CATEGORY)).toBeLessThanOrEqual(1);
  });

  it('scores a multi-word category with partial overlap between 0 and 1', () => {
    const score = scorePinpointGuess('stock market', 'Stock market terms');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('gives full credit for the bare keyed word when the category quotes it', () => {
    expect(scorePinpointGuess('fall', "Words that come before 'fall'")).toBe(1);
  });
});

describe('isPinpointGuessCorrect', () => {
  it('accepts the exact category', () => {
    expect(isPinpointGuessCorrect(CATEGORY, CATEGORY)).toBe(true);
  });

  it('accepts a close paraphrase', () => {
    expect(isPinpointGuessCorrect('words before price', CATEGORY)).toBe(true);
  });

  it('rejects a thematically adjacent but wrong guess', () => {
    expect(isPinpointGuessCorrect('kinds of market', CATEGORY)).toBe(false);
  });

  it('rejects an empty guess', () => {
    expect(isPinpointGuessCorrect('', CATEGORY)).toBe(false);
  });
});

describe('pinpointMatchPercent', () => {
  it('reports a whole percentage', () => {
    const percent = pinpointMatchPercent('types of fruit', CATEGORY);
    expect(Number.isInteger(percent)).toBe(true);
    expect(percent).toBeGreaterThanOrEqual(0);
    expect(percent).toBeLessThanOrEqual(100);
  });

  it('reports 100 for the exact answer', () => {
    expect(pinpointMatchPercent(CATEGORY, CATEGORY)).toBe(100);
  });
});

describe('pinpointAnswerShape', () => {
  it('reports word count and initials without giving the answer away', () => {
    const shape = pinpointAnswerShape(CATEGORY);
    expect(shape.wordCount).toBe(5);
    expect(shape.initials).toEqual(['W', 'T', 'C', 'B', 'P']);
  });

  it('masks each word to its initial plus length dots', () => {
    const shape = pinpointAnswerShape('Stock market');
    expect(shape.masked).toEqual(['S····', 'M·····']);
  });

  it('handles a single-word category', () => {
    const shape = pinpointAnswerShape('Renewal');
    expect(shape.wordCount).toBe(1);
    expect(shape.initials).toEqual(['R']);
  });

  it("strips quotes so a keyed word's initial is a letter, not a punctuation mark", () => {
    const shape = pinpointAnswerShape("Words that come before 'fall'");
    expect(shape.initials).toEqual(['W', 'T', 'C', 'B', 'F']);
    expect(shape.masked[4]).toBe('F···');
  });
});
