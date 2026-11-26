import { parsePositiveInt, toPrismaPageArgs } from './pagination.util';

describe('parsePositiveInt', () => {
  it.each([undefined, '', 'abc', '0', '-5'])('returns undefined for %p', (value) => {
    expect(parsePositiveInt(value)).toBeUndefined();
  });

  it('parses a positive integer string', () => {
    expect(parsePositiveInt('20')).toBe(20);
  });
});

describe('toPrismaPageArgs', () => {
  it('returns an empty object when pagination is omitted', () => {
    expect(toPrismaPageArgs(undefined)).toEqual({});
  });

  it('returns an empty object when limit is unset', () => {
    expect(toPrismaPageArgs({ page: 2 })).toEqual({});
  });

  it('returns only take when limit is set without page', () => {
    expect(toPrismaPageArgs({ limit: 10 })).toEqual({ take: 10 });
  });

  it('returns take + skip when both limit and page are set', () => {
    expect(toPrismaPageArgs({ limit: 10, page: 3 })).toEqual({ take: 10, skip: 20 });
  });
});
