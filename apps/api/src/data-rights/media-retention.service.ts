import { Inject, Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_PROVIDER, type StorageProvider } from '../storage/storage-provider.interface';

/** Raw photos, clips and recordings are kept this long after the assessment completed. */
export const MEDIA_RETENTION_DAYS = 30;

const BATCH_SIZE = 200;

export interface MediaPurgeResult {
  /** Media rows whose stored object and row were both removed. */
  deleted: number;
  /** Media rows left in place because the stored object could not be deleted; the next run retries them. */
  failed: number;
}

@Injectable()
export class MediaRetentionService {
  private readonly logger = new Logger(MediaRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /**
   * Deletes raw media (the stored object and its `media_assets` row) for
   * assessments that completed more than MEDIA_RETENTION_DAYS before `now`.
   *
   * Scores, recommendations, vision/voice results, answers and reports are not
   * touched: they hang off the assessment, not the media row. `VisionResult`
   * and `VoiceResult` link to the media row with `onDelete: SetNull`, so they
   * survive with a null `mediaAssetId`. That null link is how a purged asset
   * is "marked" without a schema change: the row is simply gone.
   *
   * Idempotent and safe to run as often as you like (a cron, or the admin
   * endpoint): once a row is gone there is nothing left to find. The object is
   * deleted before the row, so if the object delete fails the row stays and
   * the next run retries it. `now` is a parameter so tests can fix the clock.
   *
   * Logs only counts.
   */
  async purgeExpiredMedia(now: Date = new Date()): Promise<MediaPurgeResult> {
    const cutoff = new Date(now.getTime() - MEDIA_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    let deleted = 0;
    let failed = 0;
    let cursor: string | undefined;

    for (;;) {
      const batch = await this.prisma.mediaAsset.findMany({
        // `id > cursor` rather than Prisma's `cursor`: the cursor row has just been deleted.
        where: {
          assessment: { status: 'COMPLETED', completedAt: { lt: cutoff } },
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        select: { id: true, storagePath: true },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
      });
      if (batch.length === 0) break;
      cursor = batch[batch.length - 1].id;

      for (const asset of batch) {
        try {
          await this.storage.delete(asset.storagePath);
        } catch {
          failed += 1;
          continue;
        }
        await this.prisma.mediaAsset.deleteMany({ where: { id: asset.id } });
        deleted += 1;
      }
    }

    this.logger.log(`Media retention: ${deleted} deleted, ${failed} failed (cutoff ${cutoff.toISOString()})`);
    return { deleted, failed };
  }
}
