import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { validateEnv } from './config/env.validation';
import { AuthModule } from './auth/auth.module';
import { HealthProfileModule } from './health-profile/health-profile.module';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AssessmentsModule } from './assessments/assessments.module';
import { ReportsModule } from './reports/reports.module';
import { ChatModule } from './chat/chat.module';
import { AdminModule } from './admin/admin.module';
import { AdminMetricsModule } from './admin-metrics/admin-metrics.module';
import { ProviderHealthModule } from './provider-health/provider-health.module';
import { GoalsModule } from './goals/goals.module';
import { WeeklyActionsModule } from './weekly-actions/weekly-actions.module';
import { DataRightsModule } from './data-rights/data-rights.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    PrismaModule,
    AuthModule,
    HealthProfileModule,
    FeatureFlagsModule,
    DashboardModule,
    AssessmentsModule,
    ReportsModule,
    ChatModule,
    AdminModule,
    AdminMetricsModule,
    ProviderHealthModule,
    GoalsModule,
    WeeklyActionsModule,
    DataRightsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
