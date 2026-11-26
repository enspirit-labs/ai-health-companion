import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { DeleteAccountInput } from '@aidoctor/shared';

import { AUTH_PROVIDER, type AuthProvider } from '../auth/providers/auth-provider.interface';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_PROVIDER, type StorageProvider } from '../storage/storage-provider.interface';

@Injectable()
export class DataRightsService {
  private readonly logger = new Logger(DataRightsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(AUTH_PROVIDER) private readonly authProvider: AuthProvider,
  ) {}

  /**
   * The caller's own data as plain JSON. Every query is filtered by `userId`
   * (directly, or through the owning assessment/report/chat session), and each
   * one uses an explicit `select`/`omit` so secrets can never leak in: no
   * password hash, no tokens, no session rows, no report share tokens, and no
   * internal storage paths (media is described, not included).
   */
  async exportData(userId: string) {
    const [
      user,
      healthProfile,
      consents,
      assessments,
      reports,
      chatSessions,
      goals,
      weeklyActions,
      snapshots,
      feedback,
      activity,
    ] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          fullName: true,
          avatarUrl: true,
          role: true,
          authProvider: true,
          emailVerifiedAt: true,
          timezone: true,
          createdAt: true,
        },
      }),
      this.prisma.healthProfile.findUnique({ where: { userId }, omit: { id: true, userId: true } }),
      this.prisma.consentRecord.findMany({
        where: { userId },
        select: { type: true, granted: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.assessment.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          type: true,
          status: true,
          mode: true,
          startedAt: true,
          completedAt: true,
          answers: { select: { questionKey: true, question: true, answer: true, order: true }, orderBy: { order: 'asc' } },
          mediaAssets: { select: { id: true, kind: true, mimeType: true, sizeBytes: true, captureLabel: true, createdAt: true } },
          visionResults: { select: { observations: true, modelName: true, confidence: true, createdAt: true } },
          voiceResults: {
            select: { transcript: true, observations: true, durationSeconds: true, confidence: true, createdAt: true },
          },
          score: {
            select: {
              value: true,
              riskLevel: true,
              confidence: true,
              observations: true,
              disclaimer: true,
              createdAt: true,
              recommendations: { select: { title: true, detail: true, priority: true } },
            },
          },
        },
      }),
      this.prisma.report.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          title: true,
          status: true,
          summary: true,
          createdAt: true,
          sections: { select: { heading: true, content: true, order: true }, orderBy: { order: 'asc' } },
        },
      }),
      this.prisma.chatSession.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          title: true,
          createdAt: true,
          messages: { select: { role: true, content: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
        },
      }),
      this.prisma.userGoal.findMany({ where: { userId }, select: { goal: true, active: true, createdAt: true } }),
      this.prisma.weeklyActionCompletion.findMany({
        where: { userId },
        select: { weekStart: true, goal: true, actionId: true, completedAt: true },
        orderBy: { completedAt: 'asc' },
      }),
      this.prisma.wellnessSnapshot.findMany({
        where: { userId },
        omit: { id: true, userId: true },
        orderBy: { capturedAt: 'asc' },
      }),
      this.prisma.feedback.findMany({
        where: { userId },
        select: { category: true, message: true, rating: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.activityLog.findMany({
        where: { userId },
        select: { action: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    if (!user) {
      throw new NotFoundException('Account not found');
    }

    this.logger.log(`Data export for ${userId}: ${assessments.length} assessments, ${reports.length} reports`);
    return {
      exportedAt: new Date().toISOString(),
      user,
      healthProfile,
      consents,
      assessments,
      reports,
      chatSessions,
      goals,
      weeklyActions,
      wellnessSnapshots: snapshots,
      feedback,
      activity,
    };
  }

  /**
   * Permanently deletes the caller's account and everything they own: stored
   * media objects first (an object with no row pointing at it can never be
   * found again, so a failure aborts before any row is touched and the call
   * can simply be retried), then the user row, whose relations all cascade
   * (profile, consents, assessments and their answers/results/scores/media
   * rows, reports, chat, goals, weekly actions, snapshots, feedback, daily
   * pulse games, password-reset tokens and sessions). Activity logs are
   * `SetNull` rather than cascade, so they are deleted explicitly in the same
   * transaction. Deleting the sessions is what kills any refresh token still
   * in circulation: refresh requires the session row to exist.
   *
   * Only ids and counts are logged, never content.
   */
  async deleteAccount(userId: string, input: DeleteAccountInput): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Account not found');
    }

    // Password accounts re-enter their password; accounts without one (social
    // sign-in) rely on the typed confirmation already validated by the schema.
    // 403, not 401: a 401 would make the web app treat the session as expired.
    if (user.authProvider === 'EMAIL') {
      if (!input.password) {
        throw new BadRequestException('Enter your password to delete your account');
      }
      const valid = await this.authProvider.verifyCredential({
        email: user.email,
        password: input.password,
        storedPasswordHash: user.passwordHash,
        externalId: user.supabaseAuthId,
      });
      if (!valid) {
        throw new ForbiddenException('That password is not correct');
      }
    }

    const [mediaAssets, reports] = await Promise.all([
      this.prisma.mediaAsset.findMany({
        where: { assessment: { userId } },
        select: { storagePath: true },
      }),
      this.prisma.report.findMany({
        where: { userId, pdfStoragePath: { not: null } },
        select: { pdfStoragePath: true },
      }),
    ]);
    const paths = [
      ...mediaAssets.map((m) => m.storagePath),
      ...reports.map((r) => r.pdfStoragePath).filter((p): p is string => Boolean(p)),
    ];

    let failed = 0;
    for (const path of paths) {
      try {
        await this.storage.delete(path);
      } catch {
        failed += 1;
      }
    }
    if (failed > 0) {
      this.logger.error(`Account deletion aborted for ${userId}: ${failed} of ${paths.length} stored objects not deleted`);
      throw new InternalServerErrorException('We could not delete all your stored files. Nothing was removed; please try again.');
    }

    const [logs] = await this.prisma.$transaction([
      this.prisma.activityLog.deleteMany({ where: { userId } }),
      this.prisma.user.delete({ where: { id: userId } }),
    ]);

    try {
      await this.authProvider.deleteCredential({ externalId: user.supabaseAuthId, email: user.email });
    } catch {
      this.logger.error(`Account ${userId} deleted but its external credential could not be removed`);
    }

    this.logger.log(`Account ${userId} deleted: ${paths.length} stored objects, ${logs.count} activity logs`);
    return { message: 'Your account and data have been deleted.' };
  }
}
