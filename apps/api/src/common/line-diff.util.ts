// Above this many line pairs the LCS table gets expensive; prompts are never
// that long in practice, so past it we just record a whole-text replacement.
const MAX_LCS_CELLS = 1_000_000;

/**
 * A compact line diff for audit logs: only changed lines, each prefixed with
 * `-` (removed) or `+` (added), in document order. No context lines or hunk
 * headers — the full old and new text can be recovered from the template
 * history if ever needed; this is for a human scanning what changed. Returns
 * an empty string when the texts are identical.
 */
export function compactLineDiff(before: string, after: string): string {
  if (before === after) return '';

  const a = before.split('\n');
  const b = after.split('\n');

  if (a.length * b.length > MAX_LCS_CELLS) {
    return [...a.map((l) => `-${l}`), ...b.map((l) => `+${l}`)].join('\n');
  }

  // lcs[i][j] = length of the longest common subsequence of a[i..] and b[j..].
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push(`-${a[i++]}`);
    } else {
      out.push(`+${b[j++]}`);
    }
  }
  while (i < a.length) out.push(`-${a[i++]}`);
  while (j < b.length) out.push(`+${b[j++]}`);
  return out.join('\n');
}
