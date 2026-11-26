import { compactLineDiff } from './line-diff.util';

describe('compactLineDiff', () => {
  it('returns an empty string for identical text', () => {
    expect(compactLineDiff('a\nb', 'a\nb')).toBe('');
  });

  it('shows a changed line as a removal followed by an addition, omitting unchanged lines', () => {
    expect(
      compactLineDiff('keep\nold rule\nkeep too', 'keep\nnew rule\nkeep too'),
    ).toBe('-old rule\n+new rule');
  });

  it('shows a pure addition and a pure removal', () => {
    expect(compactLineDiff('a\nc', 'a\nb\nc')).toBe('+b');
    expect(compactLineDiff('a\nb\nc', 'a\nc')).toBe('-b');
  });

  it('handles a change from empty text', () => {
    expect(compactLineDiff('', 'first line')).toBe('-\n+first line');
  });
});
