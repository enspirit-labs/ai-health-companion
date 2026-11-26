import type { FactoryProvider, Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Builds a NestJS factory provider that picks between two already-registered
 * injectables based on env-var presence, resolved once at module-init time.
 * Used to wire the ai/storage/transcription "real provider vs mock/local
 * fallback" modules without repeating the same inject/useFactory shape.
 */
export function createEnvSwitchedProvider<TPrimary, TFallback>(options: {
  provide: string | symbol;
  primary: Type<TPrimary>;
  fallback: Type<TFallback>;
  usePrimaryWhen: (config: ConfigService) => boolean;
}): FactoryProvider<TPrimary | TFallback> {
  return {
    provide: options.provide,
    inject: [ConfigService, options.fallback, options.primary],
    useFactory: (config: ConfigService, fallback: TFallback, primary: TPrimary) =>
      options.usePrimaryWhen(config) ? primary : fallback,
  };
}
