# AI Health Companion

A general-wellness web app for adults (18+) that helps people start, keep up and get back to
healthy habits: movement, sleep, stress management, hydration and self-care. Built by the AI team
at [Enspirit](https://enspirit.co).

Live prototype: **https://alpha.enspirit.us**

> **Intended use.** AI Health Companion gives general wellness information only. It is not
> intended to diagnose, screen for, monitor, treat, cure, mitigate or prevent any disease or
> condition, and it does not replace professional care. Scores are habit and engagement
> feedback, not medical measurements.

## What it does

- **Daily check-in** of under two minutes, with a **lapse-tolerant streak**: a missed day leads to
  a "welcome back" state, not a reset to zero.
- **Goals and weekly actions**: the user picks goals, and gets three small actions a week for each.
- **Self-checks**: questionnaires (mental wellness, lifestyle), interactive tests (hand
  coordination, memory) and optional camera checks (face, eye, skin, teeth, posture, squats),
  framed as cosmetic and habit feedback. Pose and face tracking run in the browser with MediaPipe
  (WASM). Captured photos are uploaded and analysed by the AI provider. Voice and Tongue are
  switched off with feature flags.
- **AI wellness coach** (chat) that can see the user's own results, behind the safety pipeline
  described below.
- **Reports** (PDF), **recommendations**, and an **admin** area with aggregate-only metrics, a
  prompt-template editor with version history, and feature flags.
- **Data rights**: separate, revocable consents; full JSON export; permanent account deletion;
  raw media purged 30 days after scoring.

## Architecture

```
Browser (Next.js 15 / React 19, MediaPipe WASM on-device)
   │  same-origin proxy  /api/proxy/*
   ▼
API (NestJS 11 on Express)  ── Prisma 6 ──►  PostgreSQL 16
   │  global guards: Throttler → JWT auth → Roles; per-user AI throttle on chat and assessment completion
   │  consent checked on the server before any AI call
   ├── Safety pipeline (every coach message, in this order)
   │     1. deterministic red-flag rules      packages/shared/src/red-flags.ts
   │     2. model-assisted classifier         (only on a rules miss; on error it falls back to the rules)
   │     3. guardrail system prompt, always prepended in code
   │     4. output filter on model text       packages/shared/src/output-filter.ts
   │     Any trigger at 1 or 2 returns fixed, human-written copy with emergency numbers
   │     (packages/shared/src/escalation-copy.ts). The model is not called on that path.
   ├── AI provider (Anthropic), switched by env var; a mock provider is used when no key is set
   └── Storage provider (local disk or Supabase), switched by env var
```

| Package | Path | Stack |
|---|---|---|
| `@aidoctor/web` | `apps/web` | Next.js 15 (App Router), React 19, Tailwind v4, shadcn/Radix, TanStack Query 5 |
| `@aidoctor/api` | `apps/api` | NestJS 11, Prisma 6, PostgreSQL 16 |
| `@aidoctor/shared` | `packages/shared` | Zod schemas and pure domain logic (safety rules, copy, scoring), CJS + ESM |

pnpm workspaces orchestrated by Turborepo.

## Run it locally

Requires Node 20+, pnpm 10.10.0 and PostgreSQL 16 (`docker compose up -d` starts one with
db/user/password `aidoctor`).

```bash
pnpm install
cp apps/api/.env.example apps/api/.env      # set JWT_SECRET (openssl rand -hex 32)
cp apps/web/.env.example apps/web/.env.local
pnpm db:migrate && pnpm db:seed
pnpm dev                                     # web on http://localhost:4000, API on :3001/api
```

With `ANTHROPIC_API_KEY` empty, the API uses a **mock AI provider** whose scores and replies are
not real. Admins see which providers are active at `GET /api/admin/providers`.

Key API settings (`apps/api/.env.example` lists them all):

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Real AI provider. Leave empty to use the mock |
| `ANTHROPIC_MODEL` | Chat and analysis model. **Required when `NODE_ENV=production`**: the API will not start without it |
| `ANTHROPIC_SAFETY_MODEL`, `SAFETY_CLASSIFIER_ENABLED` | Second safety layer (default `claude-haiku-5-5`; on unless set to off) |
| `AI_THROTTLE_*` | Per-user AI limits (default chat 20/min and 150/h; assessment completion 15/min and 60/h) |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Admin user for the seed. Seeding skips the admin unless both are set |

### Scheduled jobs

Raw media is deleted 30 days after an assessment is scored. Run this daily from `apps/api`, with
`apps/api/.env` loaded:

```bash
pnpm exec ts-node --transpile-only scripts/purge-expired-media.ts
```

## Tests

```bash
pnpm exec turbo run test --force         # full suite (--force: turbo caches results otherwise)
TZ=UTC pnpm --filter @aidoctor/api test  # one package
```

`TZ=UTC` matters: some tests pin a fixed system time. CI (`.github/workflows/ci.yml`) also runs
the API end-to-end suite against a real PostgreSQL, Semgrep, Gitleaks, a safety-module coverage
report and a claims lint (`scripts/claims-lint.mjs`) that fails the build on medical wording in
user-facing copy and AI prompts.

## Safety evaluation

The crisis-detection pipeline was evaluated end to end with real models on 150 crisis messages
and 150 non-crisis messages (19 Nov 2026): **150/150 crisis messages escalated** (95% CI
97.6–100%) and **5/150 false alarms** (3.3%). The test sets themselves are not published in this
repository because they consist of crisis-language prompts.

## Data handling

- **Stored**: account, health profile, assessment answers and results, uploaded photos (raw media
  deleted 30 days after scoring), chat history, consent records, activity log.
- **Sent to a third party**: chat text and camera images go to Anthropic (USA) for analysis, only
  after the user grants the AI-processing consent. A crisis message is answered without calling
  the model.
- **Logged**: errors record the error type, not message text or model output.
- **User control**: Settings → Your data offers a JSON export and permanent deletion of the
  account, its records and its stored files.

## Assumptions and limitations

- **Prototype, not a medical device.** Wellness information only; no clinical validation. Scores
  come from a language model looking at one photo or one set of answers. There is no ground truth
  or calibration behind them, so they are presented as habit feedback.
- **Safety evaluation is English-only.** Other languages are untested and not claimed.
- **The evaluation sets were drafted with an AI assistant** and reviewed by a clinician; the
  crisis, support-card and output-filter wording is still pending a full clinician review.
- **Password reset** needs an email provider, which is not wired in production.
- **One known dependency advisory** (zod; the fix is a major-version upgrade).
- Voice and Tongue checks are switched off until they can be framed safely.

## Licence and third-party materials

Copyright © 2026 Enspirit. All rights reserved. The code is published for review; no licence to
reuse it is granted. Open-source dependencies are under their own licences (mostly MIT and
Apache 2.0). The MediaPipe models and WASM runtime in `apps/web/public/cv/` are Google's, under
Apache 2.0. Anthropic's API is used as a paid service under its terms. No third-party datasets
are used.
