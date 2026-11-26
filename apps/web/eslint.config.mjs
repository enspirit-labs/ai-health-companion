// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import { dirname } from "path";
import { fileURLToPath } from "url";
import { defineConfig, globalIgnores } from "eslint/config";
import { FlatCompat } from "@eslint/eslintrc";

const __dirname = dirname(fileURLToPath(import.meta.url));

// eslint-config-next still ships its shareable configs in the legacy
// .eslintrc shape (`module.exports = { extends: [...] }`), not as flat-config
// arrays, so they need FlatCompat's bridge rather than a plain import.
const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = defineConfig([
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored MediaPipe WASM glue code (Emscripten-generated, not source).
    "public/cv/mediapipe/**",
  ]),
  ...storybook.configs["flat/recommended"]
]);

export default eslintConfig;
