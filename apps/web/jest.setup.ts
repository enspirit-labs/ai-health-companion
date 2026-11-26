import '@testing-library/jest-dom';
import { toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

// ESM-only package (no CJS build) — Jest can't parse its `import`/`export`
// syntax from node_modules without a much heavier transformIgnorePatterns
// change that would also pull in its transitive deps. No test exercises the
// actual animation, so a no-op stub is simpler than fighting the transform.
jest.mock('@lottiefiles/dotlottie-react', () => ({
  DotLottieReact: () => null,
}));
