#!/usr/bin/env node
// Claims lint: fails when user-facing copy or AI prompts use
// wording that frames the app as a medical screening / diagnostic tool or
// names a medical condition.
//
// Scans string literals, template-literal text and JSX text only — never
// comments or identifiers — in:
//   apps/web/src        (excluding tests and stories)
//   packages/shared/src (excluding tests)
//   apps/api/prisma/seed.ts
//
// Usage:
//   node scripts/claims-lint.mjs                       # scan the source tree
//   node scripts/claims-lint.mjs --prompts a.json b.txt # also scan exported
//                                                       # production prompts (whole text)
//
// Exit code 1 on any hit that isn't covered by ALLOWLIST below.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SCAN_TARGETS = [
  { path: 'apps/web/src', exclude: [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /\.stories\.[jt]sx?$/, /__tests__/] },
  { path: 'packages/shared/src', exclude: [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/, /condition-terms\.ts$/] },
  { path: 'apps/api/prisma/seed.ts', exclude: [] },
];

const SOURCE_EXTENSIONS = /\.(m?[jt]sx?)$/;

/**
 * Medical conditions that must never be named in user-facing copy or prompts.
 * Read from the shared list the runtime output filter uses, so the
 * two can't drift apart.
 */
const CONDITION_TERMS_FILE = 'packages/shared/src/condition-terms.ts';
const CONDITIONS = [...readFileSync(join(ROOT, CONDITION_TERMS_FILE), 'utf8').matchAll(/^\s*'([^']+)',$/gm)].map(
  (match) => match[1].replace(/ /g, '\\s+'),
);

const BANNED_TERMS = [
  { id: 'screening', pattern: /screening/i },
  { id: 'diagnos', pattern: /diagnos/i },
  { id: 'risk level', pattern: /risk[\s-]+level/i },
  { id: 'condition', pattern: new RegExp(`\\b(${CONDITIONS.join('|')})(?:s|es|ic)?\\b`, 'i') },
];

/**
 * Each entry exempts hits of one banned term in one file, either for the
 * whole file or only for literals containing `text`. Keep every entry
 * narrow and give a reason.
 */
const ALLOWLIST = [
  {
    file: 'packages/shared/src/constants.ts',
    term: 'diagnos',
    text: 'not medical diagnosis',
    reason: 'WELLNESS_DISCLAIMER: the disclaimer itself must say the app does not diagnose.',
  },
  {
    file: 'packages/shared/src/constants.ts',
    term: 'diagnos',
    text: 'Never diagnose a disease',
    reason: 'CHAT_SYSTEM_GUARDRAIL: the guardrail instructs the model never to diagnose.',
  },
  {
    file: 'apps/api/prisma/seed.ts',
    term: 'risk level',
    text: 'an overall risk level',
    reason: 'TODO: prompts ask for the riskLevel output field; renamed with the UI labels.',
  },
];

// ---------------------------------------------------------------------------
// Literal extraction
// ---------------------------------------------------------------------------

/**
 * Characters after which a `/` starts a regex literal rather than division.
 * `<` is left out so JSX closing tags (`</p>`) aren't mistaken for one.
 */
const REGEX_PRECEDERS = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '>', '~', '^']);

/**
 * Characters after which a quote opens a string literal. In JSX text an
 * apostrophe follows a word or `}` (`I'm`, `{name}'s`), so those are left out
 * and the text is picked up by the JSX-text pass instead. `>` only counts as
 * part of an arrow (`=> 'x'`) in JSX files.
 */
const STRING_PRECEDERS = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', ';', '+', '-', '*', '%', '<', '~', '^']);

/** Keywords that can directly precede an expression (string or regex literal). */
const EXPRESSION_KEYWORDS = /^(return|typeof|case|in|of|void|yield|await|else|throw|new|delete|keyof|from|import|export|extends)$/;

/**
 * Returns `{ text, line }` for every string literal and template-literal
 * text chunk in `source`, skipping comments and module specifiers. For
 * .tsx/.jsx files also returns JSX text between tags. `code` is the source
 * with comments and literal contents blanked out (same length), used to
 * find JSX text without tripping over strings or comments.
 */
function extractLiterals(source, isJsx) {
  const literals = [];
  const code = source.split('');
  let i = 0;
  let line = 1;
  let lastSignificant = '';
  let beforeLast = '';
  let lastWord = '';
  const templateDepth = []; // brace depth at which each open template's ${ } closes
  let braceDepth = 0;

  const blank = (from, to) => {
    for (let k = from; k < to; k += 1) if (code[k] !== '\n') code[k] = ' ';
  };
  const isModuleSpecifier = () => /^(from|import|require|mock)$/.test(lastWord);

  function readString(quote) {
    const start = i;
    const startLine = line;
    i += 1;
    let text = '';
    while (i < source.length && source[i] !== quote) {
      if (source[i] === '\\') {
        text += source[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (source[i] === '\n') line += 1;
      text += source[i];
      i += 1;
    }
    i += 1;
    if (!isModuleSpecifier()) literals.push({ text, line: startLine });
    blank(start + 1, i - 1);
  }

  /** Reads template text up to the closing backtick or the next `${`. */
  function readTemplateChunk() {
    const start = i;
    const startLine = line;
    let text = '';
    while (i < source.length) {
      const ch = source[i];
      if (ch === '\\') {
        text += source[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (ch === '`') {
        literals.push({ text, line: startLine });
        blank(start, i);
        i += 1;
        return;
      }
      if (ch === '$' && source[i + 1] === '{') {
        literals.push({ text, line: startLine });
        blank(start, i);
        i += 2;
        braceDepth += 1;
        templateDepth.push(braceDepth);
        return;
      }
      if (ch === '\n') line += 1;
      text += ch;
      i += 1;
    }
  }

  function skipRegex() {
    i += 1;
    let inClass = false;
    while (i < source.length && source[i] !== '\n') {
      const ch = source[i];
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === '[') inClass = true;
      else if (ch === ']') inClass = false;
      else if (ch === '/' && !inClass) break;
      i += 1;
    }
    i += 1;
    while (/[a-z]/i.test(source[i] ?? '')) i += 1;
  }

  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];

    if (ch === '\n') {
      line += 1;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      for (let k = i; k < stop; k += 1) if (source[k] === '\n') line += 1;
      blank(i, stop);
      i = stop;
      continue;
    }
    const opensString =
      STRING_PRECEDERS.has(lastSignificant) ||
      (lastSignificant === '>' && (!isJsx || beforeLast === '='));
    if ((ch === "'" || ch === '"') && opensString) {
      readString(ch);
      beforeLast = lastSignificant;
      lastSignificant = ch;
      lastWord = '';
      continue;
    }
    if (ch === '`') {
      i += 1;
      readTemplateChunk();
      lastSignificant = '`';
      lastWord = '';
      continue;
    }
    if (ch === '/' && next !== '>' && REGEX_PRECEDERS.has(lastSignificant)) {
      const start = i;
      skipRegex();
      blank(start, i);
      lastSignificant = '/';
      continue;
    }
    if (ch === '{') braceDepth += 1;
    if (ch === '}') {
      if (templateDepth.length && templateDepth[templateDepth.length - 1] === braceDepth) {
        templateDepth.pop();
        braceDepth -= 1;
        i += 1;
        readTemplateChunk();
        lastSignificant = '`';
        continue;
      }
      braceDepth -= 1;
    }
    if (/[A-Za-z0-9_$]/.test(ch)) {
      let word = '';
      while (i < source.length && /[A-Za-z0-9_$.]/.test(source[i])) word += source[i++];
      lastWord = word.split('.').pop();
      beforeLast = lastSignificant;
      lastSignificant = EXPRESSION_KEYWORDS.test(word) ? '' : 'w';
      continue;
    }
    if (!/\s/.test(ch)) {
      beforeLast = lastSignificant;
      lastSignificant = ch;
      if (ch !== '(') lastWord = '';
    }
    i += 1;
  }

  if (isJsx) {
    const blanked = code.join('');
    // JSX text runs from a tag's `>` or an expression's `}` up to the next
    // `<` or `{`. Runs that start at `}` are only treated as text when they
    // don't look like code (`} else {`, `}) => {` and so on).
    const jsxText = /([>}])([^<>{}]+)(?=[<{])/g;
    let match;
    while ((match = jsxText.exec(blanked))) {
      const text = match[2];
      if (!text.trim()) continue;
      if (match[1] === '}' && /[();=]|^\s*(else|catch|finally|while)\b/.test(text)) continue;
      const firstChar = match.index + 1 + text.search(/\S/);
      const lineNo = blanked.slice(0, firstChar).split('\n').length;
      literals.push({ text: source.slice(match.index + 1, match.index + 1 + text.length), line: lineNo });
    }
  }

  return literals;
}

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

function listFiles(target) {
  const abs = join(ROOT, target.path);
  const stat = statSync(abs);
  if (stat.isFile()) return [abs];
  const out = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = join(abs, entry.name);
    if (entry.isDirectory()) out.push(...listFiles({ path: relative(ROOT, full) }));
    else if (SOURCE_EXTENSIONS.test(entry.name)) out.push(full);
  }
  return out;
}

function isAllowed(file, termId, text) {
  return ALLOWLIST.some(
    (entry) => entry.file === file && entry.term === termId && (!entry.text || text.includes(entry.text)),
  );
}

function checkText(file, line, text, hits) {
  for (const term of BANNED_TERMS) {
    const match = term.pattern.exec(text);
    if (!match || isAllowed(file, term.id, text)) continue;
    const snippet = text.replace(/\s+/g, ' ').trim();
    hits.push({ file, line, term: match[0], snippet: snippet.length > 120 ? `${snippet.slice(0, 117)}...` : snippet });
  }
}

function main() {
  const args = process.argv.slice(2);
  const promptFiles = args[0] === '--prompts' ? args.slice(1) : [];
  if (args.length && args[0] !== '--prompts') {
    console.error('Usage: node scripts/claims-lint.mjs [--prompts <file>...]');
    process.exit(2);
  }

  const hits = [];
  let scanned = 0;

  for (const target of SCAN_TARGETS) {
    for (const abs of listFiles(target)) {
      const file = relative(ROOT, abs).split(sep).join('/');
      if (target.exclude.some((re) => re.test(file))) continue;
      scanned += 1;
      const source = readFileSync(abs, 'utf8');
      for (const { text, line } of extractLiterals(source, /\.[jt]sx$/.test(file))) {
        checkText(file, line, text, hits);
      }
    }
  }

  // Exported production prompts are plain text / JSON, so every line counts.
  for (const promptFile of promptFiles) {
    scanned += 1;
    const lines = readFileSync(promptFile, 'utf8').split('\n');
    lines.forEach((text, index) => checkText(promptFile, index + 1, text, hits));
  }

  if (hits.length === 0) {
    console.log(`claims-lint: OK (${scanned} files scanned)`);
    return;
  }

  for (const hit of hits) {
    console.error(`${hit.file}:${hit.line}  "${hit.term}"  ${hit.snippet}`);
  }
  console.error(`\nclaims-lint: ${hits.length} banned term(s) found in ${scanned} files scanned.`);
  console.error('Reword the copy, or add a narrow ALLOWLIST entry with a reason in scripts/claims-lint.mjs.');
  process.exit(1);
}

main();
