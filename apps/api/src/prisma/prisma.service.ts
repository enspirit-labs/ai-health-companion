import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

// Below this, a query is unremarkable — logging every query is log-spam and
// a needless overhead at scale; only the slow tail is worth surfacing.
const SLOW_QUERY_THRESHOLD_MS = 200;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({ log: [{ emit: 'event', level: 'query' }] });
    this.$on('query' as never, (event: Prisma.QueryEvent) => {
      if (event.duration >= SLOW_QUERY_THRESHOLD_MS) {
        this.logger.warn(`Slow query (${event.duration}ms): ${event.query}`);
      }
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Connected to database');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
