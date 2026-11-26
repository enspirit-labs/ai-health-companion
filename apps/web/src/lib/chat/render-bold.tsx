import { Fragment, type ReactNode } from 'react';

/**
 * Turns `**text**` in a model reply into <strong>, leaving every other character
 * as plain text. The rest of the reply's markdown (dashes, line breaks) already
 * reads well under `whitespace-pre-wrap`, so this is the only syntax handled.
 */
export function renderBold(text: string): ReactNode {
  // As in markdown, bold text can't start or end with a space, so `2 ** 3 **` stays as typed.
  const parts = text.split(/\*\*(\S(?:[^*\n]*?\S)?)\*\*/g);
  if (parts.length === 1) return text;
  return parts.map((part, index) =>
    index % 2 === 1 ? <strong key={index}>{part}</strong> : <Fragment key={index}>{part}</Fragment>,
  );
}
