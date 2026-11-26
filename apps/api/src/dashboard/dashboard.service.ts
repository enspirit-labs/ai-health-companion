import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ASSESSMENT_TYPES,
  computeVibe,
  computeWellnessSummary,
  isAssessmentTypeHidden,
  type AssessmentType,
  type PulseAnswers,
  type PulseGameType,
  type PulseVibe,
} from '@aidoctor/shared';
import type {
  AssessmentHistoryItem,
  DashboardRecommendation,
  DashboardSummary,
  PulseGame,
  PulseGameCompletedInput,
  RecentReportItem,
  RecommendedAssessment,
  SomethingNewToTry,
  StreakSummary,
  WellnessTrendPoint,
} from '@aidoctor/shared';

import { PrismaService } from '../prisma/prisma.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { findLatestScoresByType } from '../common/wellness-snapshot.util';
import { riskLevelForScore } from '../common/risk-level.util';
import { dateKeyInZone, dayOfYear } from '../common/date.util';
import { computeCurrentStreak } from '../common/streak.util';
import { selectMixedQuota } from '../common/mixed-quota.util';
import { generateTangoPuzzle } from '../common/tango-generator';
import { AI_PROVIDER, type AiProvider } from '../ai/ai-provider.interface';
import { composeSystemPrompt } from '../ai/compose-system-prompt';

const PULSE_GAME_PROMPT_KEY = 'dashboard.pulse_game.pinpoint.system';
const DEFAULT_PULSE_GAME_PROMPT =
  'Generate a short, lighthearted guess-the-category word puzzle: a category phrase plus a few single-word clues that all belong to it, unrelated to any health or medical topic.';

/**
 * Copy for the dashboard tile, tying today's puzzle back to the check-in that
 * chose it. Code-side rather than model-generated: it must be reliable enough
 * to render before the game is even opened, and there's nothing here an LLM
 * does better than a lookup. Never states a health inference — it reflects
 * what the user themselves just reported.
 */
function pulseGameBlurb(gameType: PulseGameType, vibe: PulseVibe): string {
  if (gameType === 'TANGO') {
    if (!vibe.calm) {
      return "You logged a heavier day — here's a quiet logic grid to slow down with. No timer pressure.";
    }
    return vibe.energy === 'LOW'
      ? "A calm, low-key grid to ease into — one small win, nothing taxing."
      : "A balanced logic grid to keep that steady momentum going.";
  }

  if (vibe.connection === 'HIGH') {
    return "You're feeling connected today — try a word puzzle about spotting what things have in common.";
  }
  return vibe.energy === 'HIGH'
    ? "Plenty of energy today — see how few clues you need to crack the category."
    : "A short word puzzle: find the thread linking a handful of clues.";
}

// Prisma's `in` filter wants a mutable array; ASSESSMENT_TYPES is declared
// `as const` (readonly) for iteration elsewhere in the codebase.
const KNOWN_ASSESSMENT_TYPES: AssessmentType[] = [...ASSESSMENT_TYPES];

const DAILY_PULSE_UNAVAILABLE_MESSAGE = `This isn't available yet. Check back soon.`;

// Mental Wellness is already served by Daily Pulse itself — recommending it
// again here would be redundant with the habit the user is already doing.
// Hidden types (see isAssessmentTypeHidden) are excluded too, so "something
// new to try" never surfaces an assessment the picker itself doesn't show.
const RECOMMENDABLE_ASSESSMENT_TYPES: AssessmentType[] = KNOWN_ASSESSMENT_TYPES.filter(
  (type) => type !== 'MENTAL_WELLNESS' && !isAssessmentTypeHidden(type),
);

// Rotate among the top-N most stale candidates rather than always
// recommending the single most stale one, so the suggestion varies day to
// day instead of freezing on one type indefinitely.
const RECOMMENDATION_ROTATION_POOL_SIZE = 3;

const RECOMMENDATIONS_FULL_QUOTA = 4;
const RECOMMENDATIONS_PULSE_QUOTA = 2;
const RECOMMENDATIONS_TOTAL_QUOTA = RECOMMENDATIONS_FULL_QUOTA + RECOMMENDATIONS_PULSE_QUOTA;

// JS string comparison doesn't match Postgres's LOW/MEDIUM/HIGH enum ordinal
// ordering (the DB query relies on for its own `orderBy`) — this mirrors
// that ordinal explicitly for the in-memory re-sort after merging pools.
const PRIORITY_RANK: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly featureFlags: FeatureFlagsService,
    @Inject(AI_PROVIDER) private readonly aiProvider: AiProvider,
  ) {}

  /**
   * Computed live from the latest scored completion of each assessment type,
   * not read from a stored snapshot, so it can't go stale or keep scores
   * written under an older type-to-dimension mapping. See
   * computeWellnessSummary for how the numbers are derived.
   */
  async getSummary(userId: string): Promise<DashboardSummary> {
    const latest = await findLatestScoresByType(this.prisma, userId);
    const { overallScore, dimensions, includedTypes } = computeWellnessSummary(latest);

    const newestCompletedAt = latest.reduce<Date | null>(
      (newest, row) => (row.completedAt && (!newest || row.completedAt > newest) ? row.completedAt : newest),
      null,
    );

    return {
      hasData: overallScore !== null,
      overallScore,
      riskLevel: overallScore !== null ? riskLevelForScore(overallScore) : null,
      dimensions,
      includedTypes,
      generatedAt: newestCompletedAt?.toISOString() ?? null,
    };
  }

  async getTrends(userId: string, days: number): Promise<WellnessTrendPoint[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const snapshots = await this.prisma.wellnessSnapshot.findMany({
      where: { userId, capturedAt: { gte: since } },
      orderBy: { capturedAt: 'asc' },
      select: { capturedAt: true, overallScore: true },
    });

    return snapshots.map((s) => ({
      capturedAt: s.capturedAt.toISOString(),
      overallScore: s.overallScore,
    }));
  }

  async getAssessmentHistory(userId: string, limit = 20): Promise<AssessmentHistoryItem[]> {
    const assessments = await this.prisma.assessment.findMany({
      // Scoping to known types guards against rows whose `type` predates the
      // current enum (e.g. a since-removed assessment type) — Prisma throws
      // deserializing a column value it doesn't recognize, so those rows
      // must never be selected in the first place, not filtered afterward.
      where: { userId, status: 'COMPLETED', type: { in: KNOWN_ASSESSMENT_TYPES } },
      orderBy: { completedAt: 'desc' },
      take: limit,
      include: { score: true },
    });

    return assessments.map((a) => ({
      id: a.id,
      type: a.type,
      status: a.status,
      score: a.score?.value ?? null,
      riskLevel: a.score?.riskLevel ?? null,
      completedAt: a.completedAt?.toISOString() ?? null,
      mode: a.mode,
    }));
  }

  /**
   * Scoped to FULL only — a PULSE completion (the daily check-in) shouldn't
   * mark its own type as "done" here, since the point of this list is
   * surfacing full assessment modules the user hasn't tried yet, not
   * reflecting today's quick check-in.
   */
  async getUpcomingAssessments(userId: string): Promise<AssessmentType[]> {
    const completed = await this.prisma.assessment.findMany({
      where: { userId, status: 'COMPLETED', mode: 'FULL', type: { in: KNOWN_ASSESSMENT_TYPES } },
      select: { type: true },
      distinct: ['type'],
    });
    const completedTypes = new Set(completed.map((c) => c.type));
    return ASSESSMENT_TYPES.filter((type) => !completedTypes.has(type));
  }

  /**
   * Derived, not stored — bucketed by the user's own timezone (falling back
   * to UTC until they have one set) so "today" matches their calendar day,
   * not the server's. Library-wide: any of the 14 assessment types keeps the
   * streak alive, not just Daily Pulse — completing a deeper assessment on a
   * given day shouldn't be penalized relative to the quick check-in.
   *
   * Gated by the daily_pulse flag — this belongs to that epic, and the flag
   * is meant to be a real kill-switch, not just a UI toggle, so the API
   * itself must reject while it's off (defense in depth against a client
   * that navigates here directly while the feature is disabled).
   */
  async getStreak(userId: string): Promise<StreakSummary> {
    if (!(await this.featureFlags.isEnabled('daily_pulse'))) {
      throw new NotFoundException(DAILY_PULSE_UNAVAILABLE_MESSAGE);
    }

    const [user, completions] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
      this.prisma.assessment.findMany({
        where: {
          userId,
          status: 'COMPLETED',
          type: { in: KNOWN_ASSESSMENT_TYPES },
          completedAt: { not: null },
        },
        select: { completedAt: true },
      }),
    ]);

    const timezone = user?.timezone ?? null;
    const dayKeys = new Set(
      completions
        .filter((c): c is { completedAt: Date } => c.completedAt !== null)
        .map((c) => dateKeyInZone(c.completedAt, timezone)),
    );
    const todayKey = dateKeyInZone(new Date(), timezone);
    const { currentStreak, completedToday, totalActiveDays, lapsed } = computeCurrentStreak(dayKeys, todayKey);

    return { currentStreak, completedToday, goalDays: 30, totalActiveDays, lapsed };
  }

  async getRecentReports(userId: string, limit = 5): Promise<RecentReportItem[]> {
    const reports = await this.prisma.report.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return reports.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * Same crowding concern as ChatService.buildContext: a daily Pulse
   * check-in generates its own recommendations too, and without a reserved
   * FULL share those would eventually dominate this feed by sheer recency.
   * Reserves 4 FULL + 2 PULSE slots (matching the default `limit` of 6),
   * one backfilling the other when scarce (see selectMixedQuota).
   */
  async getRecommendations(userId: string, limit = 6): Promise<DashboardRecommendation[]> {
    const baseWhere = { userId, type: { in: KNOWN_ASSESSMENT_TYPES } };
    // RecommendationPriority is declared LOW/MEDIUM/HIGH in the schema, so
    // Postgres's native enum ordinal ordering sorts HIGH first on `desc` —
    // no CASE-WHEN mapping needed. Recency is only the tiebreaker within
    // the same priority.
    const orderBy = [{ priority: 'desc' as const }, { createdAt: 'desc' as const }];
    const include = { score: { include: { assessment: true } } };

    const [fullRecs, pulseRecs] = await Promise.all([
      this.prisma.recommendation.findMany({
        where: { score: { assessment: { ...baseWhere, mode: 'FULL' } } },
        orderBy,
        take: RECOMMENDATIONS_TOTAL_QUOTA,
        include,
      }),
      this.prisma.recommendation.findMany({
        where: { score: { assessment: { ...baseWhere, mode: 'PULSE' } } },
        orderBy,
        take: RECOMMENDATIONS_TOTAL_QUOTA,
        include,
      }),
    ]);

    const recommendations = selectMixedQuota(
      fullRecs,
      pulseRecs,
      RECOMMENDATIONS_FULL_QUOTA,
      RECOMMENDATIONS_PULSE_QUOTA,
      (a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || b.createdAt.getTime() - a.createdAt.getTime(),
    ).slice(0, limit);

    return recommendations.map((r) => ({
      title: r.title,
      detail: r.detail,
      priority: r.priority,
      sourceAssessment: r.score.assessment.type,
    }));
  }

  /**
   * "Something new to try" — a separate, additive discovery layer alongside
   * Daily Pulse/Streak, gated by the same flag since it belongs to the same
   * epic. Recommends a stale assessment (`ASSESSMENT`) until today's Daily
   * Pulse is complete, then switches to a generated game (`GAME`) themed on
   * today's answers (current build:
   * Tango + Pinpoint only, vibe-selected, no rotation needed yet).
   */
  async getRecommendedAssessment(userId: string): Promise<SomethingNewToTry> {
    if (!(await this.featureFlags.isEnabled('daily_pulse'))) {
      throw new NotFoundException(DAILY_PULSE_UNAVAILABLE_MESSAGE);
    }

    if (await this.featureFlags.isEnabled('daily_pulse_games')) {
      const todaysPulse = await this.findTodaysCompletedPulse(userId);
      if (todaysPulse) {
        const { game, vibe } = await this.getOrCreateTodaysGame(userId, todaysPulse);
        return {
          kind: 'GAME',
          game,
          blurb: pulseGameBlurb(game.type, vibe),
          difficulty: vibe.difficulty,
          solvedToday: await this.hasSolvedTodaysGame(userId),
        };
      }
    }

    return { kind: 'ASSESSMENT', ...(await this.getStaleAssessmentRecommendation(userId)) };
  }

  /**
   * Whether the player already finished today's puzzle, read from the same
   * ActivityLog rows the analytics use — no extra state to keep in sync, and
   * it survives a page reload so the tile doesn't offer a solved puzzle again.
   */
  private async hasSolvedTodaysGame(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
    const timezone = user?.timezone ?? null;
    const todayKey = dateKeyInZone(new Date(), timezone);

    const recent = await this.prisma.activityLog.findMany({
      where: {
        userId,
        action: 'pulse_game_completed',
        createdAt: { gte: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
      },
      select: { createdAt: true },
    });
    return recent.some((row) => dateKeyInZone(row.createdAt, timezone) === todayKey);
  }

  /**
   * Ranks every FULL-completable type (Mental Wellness excluded — it's
   * already served by Daily Pulse) by staleness: never-completed is treated
   * as maximally stale, otherwise oldest completedAt first. Rotates among
   * the top RECOMMENDATION_ROTATION_POOL_SIZE most-stale candidates using a
   * day-of-year index, so the suggestion varies day to day rather than
   * freezing on a single type indefinitely.
   */
  private async getStaleAssessmentRecommendation(userId: string): Promise<RecommendedAssessment> {
    const completions = await this.prisma.assessment.findMany({
      where: {
        userId,
        status: 'COMPLETED',
        mode: 'FULL',
        type: { in: RECOMMENDABLE_ASSESSMENT_TYPES },
      },
      orderBy: { completedAt: 'desc' },
      distinct: ['type'],
      select: { type: true, completedAt: true },
    });
    const lastCompletedByType = new Map(completions.map((c) => [c.type, c.completedAt]));

    const rankedByStaleness = [...RECOMMENDABLE_ASSESSMENT_TYPES].sort((a, b) => {
      const aCompletedAt = lastCompletedByType.get(a) ?? null;
      const bCompletedAt = lastCompletedByType.get(b) ?? null;
      if (aCompletedAt === null && bCompletedAt === null) return 0;
      if (aCompletedAt === null) return -1; // never-completed sorts as most stale
      if (bCompletedAt === null) return 1;
      return aCompletedAt.getTime() - bCompletedAt.getTime(); // oldest completedAt first
    });

    const rotationPool = rankedByStaleness.slice(0, RECOMMENDATION_ROTATION_POOL_SIZE);
    const type = rotationPool[dayOfYear(new Date()) % rotationPool.length];

    return { type };
  }

  /** Today's completed Daily Pulse assessment, bucketed by the user's own
   * timezone — same convention as getStreak — or null if not done yet. */
  private async findTodaysCompletedPulse(userId: string): Promise<{ id: string } | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
    const todayKey = dateKeyInZone(new Date(), user?.timezone ?? null);

    // completedAt is bucketed against a generous same-and-previous-day window,
    // then narrowed to the exact zone-bucketed key — matching dateKeyInZone's
    // own contract (a wall-clock day boundary, not a fixed UTC one).
    const candidates = await this.prisma.assessment.findMany({
      where: {
        userId,
        type: 'MENTAL_WELLNESS',
        mode: 'PULSE',
        status: 'COMPLETED',
        completedAt: { gte: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { completedAt: 'desc' },
      select: { id: true, completedAt: true },
    });
    const todays = candidates.find((c) => c.completedAt && dateKeyInZone(c.completedAt, user?.timezone ?? null) === todayKey);
    return todays ? { id: todays.id } : null;
  }

  /**
   * Reads/creates today's cached DailyPulseGame row for this user, generating
   * fresh content (vibe → game type → Tango or Pinpoint-with-fallback) on
   * first request each day. Returns the vibe alongside the game because the
   * caller needs it for the tile blurb/difficulty — recomputing it there would
   * mean a second read of the same answers.
   */
  private async getOrCreateTodaysGame(
    userId: string,
    pulse: { id: string },
  ): Promise<{ game: PulseGame; vibe: PulseVibe }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
    const dateKey = dateKeyInZone(new Date(), user?.timezone ?? null);

    const answers = await this.getPulseAnswers(pulse.id);
    const vibe = computeVibe(answers);
    const size = vibe.difficulty === 'EASY' ? 4 : 6;

    const existing = await this.prisma.dailyPulseGame.findUnique({ where: { userId_dateKey: { userId, dateKey } } });
    if (existing) {
      return { game: existing.content as unknown as PulseGame, vibe };
    }

    const game: PulseGame = vibe.calm
      ? generateTangoPuzzle(size, vibe.energy)
      : await this.generatePinpointOrFallback(vibe, size);

    const created = await this.prisma.dailyPulseGame.upsert({
      where: { userId_dateKey: { userId, dateKey } },
      update: {}, // a concurrent request already created it — return that one, not a duplicate
      create: { userId, dateKey, gameType: game.type, content: game as object },
    });

    // Only fires once per user per day, on the generation itself — cache
    // hits above don't re-log, so "shown" already means one row per
    // (user, day) instead of one per dashboard refetch:
    // this is the evidence that should decide whether to grow the game
    // roster post-hackathon, not a guess.
    await this.logPulseGameEvent(userId, 'pulse_game_shown', game.type, vibe);

    return { game: created.content as unknown as PulseGame, vibe };
  }

  /** Reported by the client once the user solves today's game — see the
   * dashboard.controller.ts POST route. */
  async logPulseGameCompleted(userId: string, input: PulseGameCompletedInput): Promise<void> {
    const { gameType, ...metrics } = input;
    await this.logPulseGameEvent(userId, 'pulse_game_completed', gameType, undefined, metrics);
  }

  private async logPulseGameEvent(
    userId: string,
    action: 'pulse_game_shown' | 'pulse_game_completed',
    gameType: PulseGameType,
    vibe?: PulseVibe,
    metrics?: Record<string, number | undefined>,
  ): Promise<void> {
    // Undefined metric keys are stripped so a client that omits them doesn't
    // write `null`s that later skew the averages this data exists to produce.
    const definedMetrics = Object.fromEntries(
      Object.entries(metrics ?? {}).filter(([, value]) => value !== undefined),
    );

    await this.prisma.activityLog.create({
      data: {
        userId,
        action,
        metadata: {
          gameType,
          ...(vibe ? { difficulty: vibe.difficulty, energy: vibe.energy, calm: vibe.calm } : {}),
          ...definedMetrics,
        },
      },
    });
  }

  private async getPulseAnswers(assessmentId: string): Promise<PulseAnswers> {
    const rows = await this.prisma.questionnaireAnswer.findMany({ where: { assessmentId } });
    const byKey = new Map(rows.map((r) => [r.questionKey, r.answer]));
    return {
      moodRating: byKey.get('moodRating') as PulseAnswers['moodRating'],
      stressLevel: byKey.get('stressLevel') as PulseAnswers['stressLevel'],
      sleepQuality: byKey.get('sleepQuality') as PulseAnswers['sleepQuality'],
      socialConnection: byKey.get('socialConnection') as PulseAnswers['socialConnection'],
      anxietyFrequency: byKey.get('anxietyFrequency') as PulseAnswers['anxietyFrequency'],
    };
  }

  /** Retries once on failure, then falls back to Tango (deterministic, cannot
   * fail) rather than all the way back to the stale-assessment card — the
   * user still gets a game that day, just not the LLM-generated one. */
  private async generatePinpointOrFallback(vibe: ReturnType<typeof computeVibe>, size: 4 | 6): Promise<PulseGame> {
    const promptTemplate = await this.prisma.aiPromptTemplate.findFirst({
      where: { key: PULSE_GAME_PROMPT_KEY, isActive: true },
    });
    const systemPrompt = composeSystemPrompt(promptTemplate?.systemPrompt ?? DEFAULT_PULSE_GAME_PROMPT);

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const content = await this.aiProvider.generatePulseGame({
          gameType: 'PINPOINT',
          vibe,
          difficulty: vibe.difficulty,
          systemPrompt,
        });
        return { type: 'PINPOINT', ...content };
      } catch (error) {
        this.logger.warn(`Pinpoint generation attempt ${attempt + 1} failed: ${(error as Error).message}`);
      }
    }

    this.logger.warn('Falling back to Tango after Pinpoint generation failed twice.');
    return generateTangoPuzzle(size, vibe.energy);
  }
}
