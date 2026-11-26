import { Injectable } from '@nestjs/common';
import {
  getNextHealthProfileQuestion,
  type HealthProfileQuestionKey,
  type HealthProfileUpdateInput,
} from '@aidoctor/shared';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HealthProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getForUser(userId: string) {
    const profile = await this.prisma.healthProfile.findUnique({ where: { userId } });
    return this.toResponse(profile);
  }

  async upsertAnswer(userId: string, patch: HealthProfileUpdateInput) {
    const existing = await this.prisma.healthProfile.findUnique({ where: { userId } });
    const answeredKeys = new Set(existing?.answeredQuestionKeys ?? []);
    (Object.keys(patch) as HealthProfileQuestionKey[]).forEach((key) => answeredKeys.add(key));

    const { emergencyContact, ...rest } = patch;
    const data = {
      ...rest,
      ...(emergencyContact?.name !== undefined ? { emergencyContactName: emergencyContact.name } : {}),
      ...(emergencyContact?.relationship !== undefined
        ? { emergencyContactRelationship: emergencyContact.relationship }
        : {}),
      ...(emergencyContact?.phone !== undefined ? { emergencyContactPhone: emergencyContact.phone } : {}),
      answeredQuestionKeys: Array.from(answeredKeys),
    };

    const profile = await this.prisma.healthProfile.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });

    return this.toResponse(profile);
  }

  private toResponse(profile: { answeredQuestionKeys: string[] } | null) {
    const nextQuestion = getNextHealthProfileQuestion(profile?.answeredQuestionKeys ?? []);
    return { profile, isComplete: nextQuestion === null, nextQuestion };
  }
}
