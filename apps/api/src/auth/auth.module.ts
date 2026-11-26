import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AuthThrottleModule } from '../common/throttle/auth-throttle.module';
import { ConsentModule } from '../consent/consent.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AUTH_PROVIDER } from './providers/auth-provider.interface';
import { LocalAuthProvider } from './providers/local-auth.provider';
import { SupabaseAuthProvider } from './providers/supabase-auth.provider';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    ConsentModule,
    AuthThrottleModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    LocalAuthProvider,
    SupabaseAuthProvider,
    {
      provide: AUTH_PROVIDER,
      inject: [ConfigService, LocalAuthProvider, SupabaseAuthProvider],
      useFactory: (config: ConfigService, local: LocalAuthProvider, supabase: SupabaseAuthProvider) => {
        const supabaseConfigured =
          config.get<string>('SUPABASE_URL') &&
          config.get<string>('SUPABASE_ANON_KEY') &&
          config.get<string>('SUPABASE_SERVICE_ROLE_KEY');
        return supabaseConfigured ? supabase : local;
      },
    },
  ],
  // AUTH_PROVIDER is exported so data-rights can remove the external credential on account deletion.
  exports: [AuthService, AUTH_PROVIDER],
})
export class AuthModule {}
