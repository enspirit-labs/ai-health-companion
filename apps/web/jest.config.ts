import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

const config: Config = {
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/', '<rootDir>/.tmp-e2e/'],
  // next/jest resolves `@/*` imports via its SWC transform, which rewrites the
  // specifier at compile time — but a string passed to `jest.mock('@/...')` is
  // opaque to that transform and falls through to Jest's raw resolver instead,
  // which otherwise has no idea what `@/` means. Mapping it explicitly here is
  // what makes `jest.mock('@/lib/...')` work in page-level tests.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};

export default createJestConfig(config);
