import { Inject, Injectable, Logger } from '@nestjs/common';
import { ASSESSMENT_LABELS, WELLNESS_DISCLAIMER } from '@aidoctor/shared';
import type { AssessmentType, RecentReportItem, ReportDto, ReportSectionDto } from '@aidoctor/shared';

import { PrismaService } from '../prisma/prisma.service';
import { AI_PROVIDER, type AiProvider } from '../ai/ai-provider.interface';
import { composeSystemPrompt } from '../ai/compose-system-prompt';
import { assertOwnedResource } from '../common/owned-resource.util';
import { toPrismaPageArgs, type PaginationParams } from '../common/pagination.util';
import { buildReportPdf } from './report-pdf';

const REPORT_SUMMARY_SYSTEM_PROMPT = composeSystemPrompt(`You write short, plain-language summaries of a single wellness assessment result for the person who took it. Given their score, risk level, observations, and recommendations, write 2-4 encouraging but honest sentences highlighting what stood out and what to focus on next. Do not just restate the numbers — describe them in plain language.

${WELLNESS_DISCLAIMER}`);

const WEEKLY_ROLLUP_SYSTEM_PROMPT = composeSystemPrompt(`You write a short, plain-language weekly summary of someone's daily wellness check-ins. Given how many check-ins they completed and their scores across the week, write 2-4 encouraging but honest sentences describing the overall trend — improving, steady, or declining — and one gentle suggestion. Do not just restate the numbers.

${WELLNESS_DISCLAIMER}`);

// A Daily Pulse never gets its own per-completion Report (see
// AssessmentsService.complete — that would mean ~30 near-identical reports
// a month, flooding /reports, the Recent Reports card, and burying real
// assessment findings). Instead, pulses accumulate into one rollup Report
// roughly weekly. There's no schema-level `kind` field distinguishing a
// rollup Report from a per-assessment one (adding one felt like scope creep
// for what's already an edge-of-plan addition) — this title prefix is the
// discriminator instead. If rollups ever need to generalize further, a real
// `Report.kind` enum column is the honest fix; this prefix is easy to
// backfill from at that point.
const WEEKLY_ROLLUP_TITLE_PREFIX = 'Daily Pulse — Weekly Summary';
const WEEKLY_ROLLUP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

type OwnedReport = Awaited<ReturnType<ReportsService['findOwnedReport']>>;

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_PROVIDER) private readonly aiProvider: AiProvider,
  ) {}

  /**
   * Called by AssessmentsService right after an assessment completes — turns
   * that single result into a standalone Report the user can revisit, share,
   * or export as a PDF later. Best-effort: a failure here never blocks the
   * assessment-completion response, it just leaves the Report as FAILED.
   */
  async generateForAssessment(userId: string, assessmentId: string): Promise<string> {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: { score: { include: { recommendations: true } } },
    });
    if (!assessment || !assessment.score) return '';

    const type = assessment.type as AssessmentType;
    const score = assessment.score;
    const observations = score.observations as ReportSectionDto['observations'];
    const recommendations = score.recommendations.map((r) => ({
      title: r.title,
      detail: r.detail,
      priority: r.priority,
    }));

    const report = await this.prisma.report.create({
      data: { userId, title: `${ASSESSMENT_LABELS[type]} Report`, status: 'GENERATING' },
    });

    try {
      const { summary } = await this.aiProvider.summarize({
        systemPrompt: REPORT_SUMMARY_SYSTEM_PROMPT,
        input: {
          assessmentType: type,
          score: score.value,
          riskLevel: score.riskLevel,
          observations,
          recommendations,
        },
      });

      await this.prisma.$transaction([
        this.prisma.report.update({ where: { id: report.id }, data: { status: 'READY', summary } }),
        this.prisma.reportSection.create({
          data: {
            reportId: report.id,
            assessmentId,
            heading: ASSESSMENT_LABELS[type],
            order: 0,
            content: {
              assessmentType: type,
              score: score.value,
              riskLevel: score.riskLevel,
              observations,
              recommendations,
            },
          },
        }),
      ]);
    } catch (error) {
      this.logger.error(`Failed to generate report ${report.id}`, error instanceof Error ? error.stack : error);
      await this.prisma.report.update({ where: { id: report.id }, data: { status: 'FAILED' } });
    }

    return report.id;
  }

  /**
   * Called by AssessmentsService right after a Daily Pulse (PULSE-mode
   * Mental Wellness) completes — in place of generateForAssessment, never
   * alongside it. Accumulates completed pulses into one weekly rollup
   * Report instead of one per check-in. Best-effort, same as
   * generateForAssessment: a failure here never blocks the completion
   * response.
   *
   * Triggered by piggybacking on pulse completion rather than a real
   * schedule — there's no cron/scheduler in this codebase at all yet
   * (@nestjs/schedule is Phase 2 reminder-infra scope), and a rollup is
   * only meaningful for a user who's actually been checking in, so tying
   * it to "did they just complete one" is the right trigger anyway, not
   * just the cheapest one.
   */
  async maybeGenerateWeeklyPulseRollup(userId: string): Promise<void> {
    const [lastRollup, oldestPulse] = await Promise.all([
      this.prisma.report.findFirst({
        where: { userId, title: { startsWith: WEEKLY_ROLLUP_TITLE_PREFIX } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      this.prisma.assessment.findFirst({
        where: { userId, mode: 'PULSE', status: 'COMPLETED' },
        orderBy: { completedAt: 'asc' },
        select: { completedAt: true },
      }),
    ]);

    // No prior rollup: the window starts at the user's very first pulse, so
    // the first rollup only fires once a real week of check-ins exists —
    // not on day one, and not (incorrectly) never.
    const windowStart = lastRollup?.createdAt ?? oldestPulse?.completedAt;
    if (!windowStart) return; // defensive — this is only ever called right after a pulse completes

    const now = new Date();
    if (now.getTime() - windowStart.getTime() < WEEKLY_ROLLUP_INTERVAL_MS) {
      return; // not due yet
    }

    const pulses = await this.prisma.assessment.findMany({
      where: { userId, mode: 'PULSE', status: 'COMPLETED', completedAt: { gt: windowStart, lte: now } },
      include: { score: true },
      orderBy: { completedAt: 'asc' },
    });
    if (pulses.length === 0) return; // window elapsed with nothing new since the last rollup

    const report = await this.prisma.report.create({
      data: {
        userId,
        title: `${WEEKLY_ROLLUP_TITLE_PREFIX} — ${now.toISOString().slice(0, 10)}`,
        status: 'GENERATING',
      },
    });

    try {
      const scores = pulses.map((p) => p.score?.value).filter((v): v is number => v != null);
      const { summary } = await this.aiProvider.summarize({
        systemPrompt: WEEKLY_ROLLUP_SYSTEM_PROMPT,
        input: {
          checkInCount: pulses.length,
          scores,
          windowStart: windowStart.toISOString(),
          windowEnd: now.toISOString(),
        },
      });

      await this.prisma.$transaction([
        this.prisma.report.update({ where: { id: report.id }, data: { status: 'READY', summary } }),
        ...pulses.map((p, index) =>
          this.prisma.reportSection.create({
            data: {
              reportId: report.id,
              assessmentId: p.id,
              heading: `Check-in — ${p.completedAt!.toISOString().slice(0, 10)}`,
              order: index,
              content: {
                assessmentType: 'MENTAL_WELLNESS',
                score: p.score?.value ?? null,
                riskLevel: p.score?.riskLevel ?? null,
              },
            },
          }),
        ),
      ]);
    } catch (error) {
      this.logger.error(`Failed to generate weekly pulse rollup ${report.id}`, error instanceof Error ? error.stack : error);
      await this.prisma.report.update({ where: { id: report.id }, data: { status: 'FAILED' } });
    }
  }

  async list(userId: string, pagination?: PaginationParams): Promise<RecentReportItem[]> {
    const reports = await this.prisma.report.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      ...toPrismaPageArgs(pagination),
    });
    return reports.map((r) => ({ id: r.id, title: r.title, status: r.status, createdAt: r.createdAt.toISOString() }));
  }

  async getOne(userId: string, reportId: string): Promise<ReportDto> {
    const report = await this.findOwnedReport(userId, reportId);
    return this.toDto(report);
  }

  async getPdfBuffer(userId: string, reportId: string): Promise<{ buffer: Buffer; filename: string }> {
    const report = await this.findOwnedReport(userId, reportId);
    const buffer = await buildReportPdf(this.toDto(report));
    const filename = `${report.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`;
    return { buffer, filename };
  }

  private async findOwnedReport(userId: string, reportId: string) {
    const report = await this.prisma.report.findUnique({
      where: { id: reportId },
      include: { sections: { orderBy: { order: 'asc' } } },
    });
    return assertOwnedResource(report, userId, 'Report');
  }

  private toDto(report: OwnedReport): ReportDto {
    return {
      id: report.id,
      title: report.title,
      status: report.status,
      summary: report.summary,
      createdAt: report.createdAt.toISOString(),
      sections: report.sections.map((s) => {
        const content = s.content as {
          assessmentType?: AssessmentType;
          score?: number;
          riskLevel?: ReportSectionDto['riskLevel'];
          observations?: ReportSectionDto['observations'];
          recommendations?: ReportSectionDto['recommendations'];
        };
        return {
          id: s.id,
          heading: s.heading,
          order: s.order,
          assessmentType: content.assessmentType ?? null,
          score: content.score ?? null,
          riskLevel: content.riskLevel ?? null,
          observations: content.observations ?? [],
          recommendations: content.recommendations ?? [],
        };
      }),
    };
  }
}
