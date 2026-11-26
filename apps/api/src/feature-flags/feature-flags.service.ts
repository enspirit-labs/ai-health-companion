import { Injectable } from '@nestjs/common';
import { ASSESSMENT_TYPE_FEATURE_FLAGS, assessmentTypeFeatureFlagKey } from '@aidoctor/shared';
import type { AssessmentType, FeatureFlags } from '@aidoctor/shared';

import { PrismaService } from '../prisma/prisma.service';

/** How long a read is trusted before re-querying — the practical ceiling on
 * how fast a toggle in the DB takes effect without a redeploy. */
const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  enabled: boolean;
  expiresAt: number;
}

/**
 * Server-enforced kill-switches, checked inline by the services/controllers
 * they gate (not a route guard — gating differs per call site, e.g.
 * AssessmentsService.start only checks when mode is PULSE, while dashboard
 * endpoints gate wholesale). A missing FeatureFlag row means disabled
 * (fail closed) — this is deliberate: a flag that hasn't been seeded yet, or
 * was deleted, must never silently enable the feature it's supposed to gate.
 */
@Injectable()
export class FeatureFlagsService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  async isEnabled(key: string): Promise<boolean> {
    const cached = this.cache.get(key);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return cached.enabled;
    }

    const row = await this.prisma.featureFlag.findUnique({ where: { key } });
    const enabled = row?.enabled ?? false;
    this.cache.set(key, { enabled, expiresAt: now + CACHE_TTL_MS });
    return enabled;
  }

  async getAll(): Promise<FeatureFlags> {
    const [dailyPulse, slackReminders, assessmentVoice, assessmentTongue] = await Promise.all([
      this.isEnabled('daily_pulse'),
      this.isEnabled('slack_reminders'),
      this.isEnabled(ASSESSMENT_TYPE_FEATURE_FLAGS.VOICE.key),
      this.isEnabled(ASSESSMENT_TYPE_FEATURE_FLAGS.TONGUE.key),
    ]);
    return { dailyPulse, slackReminders, assessmentVoice, assessmentTongue };
  }

  /** False only for an assessment type gated by a flag that isn't enabled —
   * ungated types are always available. */
  async isAssessmentTypeEnabled(type: AssessmentType): Promise<boolean> {
    const key = assessmentTypeFeatureFlagKey(type);
    return key === null ? true : this.isEnabled(key);
  }

  /**
   * Forces the next isEnabled(key) to re-query instead of trusting the
   * cache. Not just a test seam — a 30s worst-case delay is a real problem
   * if this is ever used as a genuine emergency kill-switch (e.g. an admin
   * panel toggle that needs to take effect immediately, not eventually).
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }
}
