import { describe, expect, it } from 'vitest';

import { DeleteAccountSchema } from './data-rights';

describe('DeleteAccountSchema', () => {
  it('accepts the typed confirmation with or without a password', () => {
    expect(DeleteAccountSchema.safeParse({ confirmation: 'DELETE' }).success).toBe(true);
    expect(DeleteAccountSchema.safeParse({ confirmation: 'DELETE', password: 'x' }).success).toBe(true);
  });

  it('rejects a missing, wrong-case or different confirmation', () => {
    expect(DeleteAccountSchema.safeParse({}).success).toBe(false);
    expect(DeleteAccountSchema.safeParse({ confirmation: 'delete' }).success).toBe(false);
    expect(DeleteAccountSchema.safeParse({ confirmation: 'yes' }).success).toBe(false);
  });
});
