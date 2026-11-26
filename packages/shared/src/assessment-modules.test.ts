import { describe, expect, it } from 'vitest';

import { ASSESSMENT_MODULES } from './assessment-modules';
import { ASSESSMENT_TYPES } from './assessment-types';

describe('ASSESSMENT_MODULES', () => {
  it('covers every assessment type exactly once', () => {
    const typesInModules = ASSESSMENT_MODULES.flatMap((module) => module.types);

    expect([...typesInModules].sort()).toEqual([...ASSESSMENT_TYPES].sort());
    expect(new Set(typesInModules).size).toBe(typesInModules.length);
  });
});
