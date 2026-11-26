import { cn } from './utils';

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('drops falsy values', () => {
    expect(cn('a', false, undefined, null, 'b')).toBe('a b');
  });

  it('lets a later Tailwind class win over a conflicting earlier one', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('applies conditional classes from an object', () => {
    expect(cn('base', { active: true, hidden: false })).toBe('base active');
  });
});
