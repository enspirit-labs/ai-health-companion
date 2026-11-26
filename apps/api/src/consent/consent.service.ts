import { ForbiddenException, Injectable } from '@nestjs/common';
import { AI_PROCESSING_CONSENT_VALID_FROM, CONSENT_REQUIRED_CODES, type ConsentType } from '@aidoctor/shared';

import { PrismaService } from '../prisma/prisma.service';

export interface ConsentStatus {
  camera: boolean;
  microphone: boolean;
  /** Latest DATA_PROCESSING record is granted AND dated on/after AI_PROCESSING_CONSENT_VALID_FROM. */
  aiProcessing: boolean;
}

@Injectable()
export class ConsentService {
  constructor(private readonly prisma: PrismaService) {}

  private latest(userId: string, type: ConsentType) {
    return this.prisma.consentRecord.findFirst({
      where: { userId, type },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * AI-processing consent is the DATA_PROCESSING type. Until recently, signup
   * auto-granted it to everyone without naming the AI provider, so a grant only
   * counts if it was created at or after AI_PROCESSING_CONSENT_VALID_FROM.
   * Trade-off: existing users (even ones who would have agreed) are asked once
   * more, rather than us relying on consent that was never informed.
   */
  private isAiProcessingGranted(record: { granted: boolean; createdAt?: Date } | null): boolean {
    return (
      !!record?.granted &&
      !!record.createdAt &&
      record.createdAt.getTime() >= AI_PROCESSING_CONSENT_VALID_FROM.getTime()
    );
  }

  /** Consent is append-only (audit trail) — only the most recent record per type is authoritative. */
  async getStatus(userId: string): Promise<ConsentStatus> {
    const [camera, microphone, dataProcessing] = await Promise.all([
      this.latest(userId, 'CAMERA'),
      this.latest(userId, 'MICROPHONE'),
      this.latest(userId, 'DATA_PROCESSING'),
    ]);

    return {
      camera: camera?.granted ?? false,
      microphone: microphone?.granted ?? false,
      aiProcessing: this.isAiProcessingGranted(dataProcessing),
    };
  }

  /**
   * Server-side enforcement: throws 403 with a stable code unless the latest
   * record for this consent is granted (a later withdrawal wins over an earlier grant).
   */
  async requireConsent(userId: string, type: 'CAMERA' | 'MICROPHONE' | 'AI_PROCESSING'): Promise<void> {
    const granted =
      type === 'AI_PROCESSING'
        ? this.isAiProcessingGranted(await this.latest(userId, 'DATA_PROCESSING'))
        : ((await this.latest(userId, type))?.granted ?? false);
    if (granted) return;

    const message = {
      CAMERA: 'Camera consent is required. You can allow it in your privacy settings.',
      MICROPHONE: 'Microphone consent is required. You can allow it in your privacy settings.',
      AI_PROCESSING:
        'AI analysis consent is required before your data can be sent to our AI provider. You can allow it in your privacy settings.',
    }[type];
    throw new ForbiddenException({ statusCode: 403, message, code: CONSENT_REQUIRED_CODES[type] });
  }

  async recordConsent(
    userId: string,
    type: ConsentType,
    granted: boolean,
    meta: { ipAddress?: string; userAgent?: string },
  ): Promise<ConsentStatus> {
    await this.prisma.consentRecord.create({
      data: { userId, type, granted, ipAddress: meta.ipAddress, userAgent: meta.userAgent },
    });
    return this.getStatus(userId);
  }
}
