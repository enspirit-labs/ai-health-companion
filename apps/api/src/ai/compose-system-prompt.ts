import { CHAT_SYSTEM_GUARDRAIL, CRISIS_SAFETY_RULES } from '@aidoctor/shared';

/**
 * Every system prompt sent to a model is built here: the code-owned guardrail
 * and crisis rules always come first, followed by the template body (an
 * admin-editable DB template or a code default). A template can add
 * instructions but can never drop the safety rules, since they aren't part of
 * what an admin edits. If the body already embeds either rule verbatim (older
 * templates and code defaults did), that copy is removed so the model doesn't
 * see it twice.
 */
export function composeSystemPrompt(templateBody: string): string {
  const body = [CHAT_SYSTEM_GUARDRAIL, CRISIS_SAFETY_RULES]
    .reduce((text, rule) => text.split(rule).join(''), templateBody)
    .trim();
  return [CHAT_SYSTEM_GUARDRAIL, CRISIS_SAFETY_RULES, body]
    .filter(Boolean)
    .join('\n\n');
}
