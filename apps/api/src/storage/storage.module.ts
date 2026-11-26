import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { createEnvSwitchedProvider } from '../common/conditional-provider.factory';
import { STORAGE_PROVIDER } from './storage-provider.interface';
import { LocalStorageProvider } from './providers/local-storage.provider';
import { SupabaseStorageProvider } from './providers/supabase-storage.provider';

@Module({
  imports: [ConfigModule],
  providers: [
    LocalStorageProvider,
    SupabaseStorageProvider,
    createEnvSwitchedProvider({
      provide: STORAGE_PROVIDER,
      primary: SupabaseStorageProvider,
      fallback: LocalStorageProvider,
      usePrimaryWhen: (config) =>
        Boolean(config.get<string>('SUPABASE_URL') && config.get<string>('SUPABASE_SERVICE_ROLE_KEY')),
    }),
  ],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}
