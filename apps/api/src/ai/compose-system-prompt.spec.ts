import { CHAT_SYSTEM_GUARDRAIL, CRISIS_SAFETY_RULES } from '@aidoctor/shared';

import { composeSystemPrompt } from './compose-system-prompt';

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('composeSystemPrompt', () => {
  it('prepends the guardrail and crisis rules when the template omits them', () => {
    const prompt = composeSystemPrompt('You are a friendly sleep coach.');

    expect(prompt).toBe(
      `${CHAT_SYSTEM_GUARDRAIL}\n\n${CRISIS_SAFETY_RULES}\n\nYou are a friendly sleep coach.`,
    );
  });

  it('does not duplicate the guardrail when the template already includes it', () => {
    const prompt = composeSystemPrompt(
      `${CHAT_SYSTEM_GUARDRAIL}\n\nYou are a friendly sleep coach.`,
    );

    expect(occurrences(prompt, CHAT_SYSTEM_GUARDRAIL)).toBe(1);
    expect(occurrences(prompt, CRISIS_SAFETY_RULES)).toBe(1);
    expect(prompt.endsWith('You are a friendly sleep coach.')).toBe(true);
  });

  it('does not duplicate the crisis rules when the template already includes them', () => {
    const prompt = composeSystemPrompt(`Be brief. ${CRISIS_SAFETY_RULES}`);

    expect(occurrences(prompt, CRISIS_SAFETY_RULES)).toBe(1);
    expect(
      prompt.startsWith(`${CHAT_SYSTEM_GUARDRAIL}\n\n${CRISIS_SAFETY_RULES}`),
    ).toBe(true);
  });

  it('keeps the safety rules first even when the template body is empty', () => {
    expect(composeSystemPrompt('   ')).toBe(
      `${CHAT_SYSTEM_GUARDRAIL}\n\n${CRISIS_SAFETY_RULES}`,
    );
  });
});
