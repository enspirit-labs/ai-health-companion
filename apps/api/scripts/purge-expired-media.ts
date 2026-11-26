/**
 * Deletes raw media older than the retention period. Meant to be
 * called by a server cron; safe to run repeatedly. See the root README, "Scheduled jobs".
 *
 * Usage (from apps/api, with apps/api/.env loaded so DATABASE_URL etc. are set):
 *   pnpm exec ts-node --transpile-only scripts/purge-expired-media.ts
 *
 * Prints one line with counts and exits non-zero if any stored object could not
 * be deleted (those rows are kept and retried on the next run).
 */
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../src/app.module';
import { MediaRetentionService } from '../src/data-rights/media-retention.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  try {
    const result = await app.get(MediaRetentionService).purgeExpiredMedia();
    // eslint-disable-next-line no-console
    console.log(`media-retention: deleted=${result.deleted} failed=${result.failed}`);
    process.exitCode = result.failed > 0 ? 1 : 0;
  } finally {
    await app.close();
  }
}

void main();
