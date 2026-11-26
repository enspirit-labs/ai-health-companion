import { randomUUID } from 'node:crypto';
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { StorageProvider } from '../storage-provider.interface';

/**
 * Delegates media storage to Supabase Storage. Activated automatically once
 * SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are set — see StorageModule's
 * provider factory. Client is created lazily since Nest always instantiates
 * this provider even when LocalStorageProvider is the active one.
 */
@Injectable()
export class SupabaseStorageProvider implements StorageProvider {
  private readonly logger = new Logger(SupabaseStorageProvider.name);
  private clientInstance: SupabaseClient | undefined;

  constructor(private readonly config: ConfigService) {}

  private get client(): SupabaseClient {
    if (!this.clientInstance) {
      this.clientInstance = createClient(
        this.config.get<string>('SUPABASE_URL')!,
        this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
      );
    }
    return this.clientInstance;
  }

  private get bucket(): string {
    return this.config.get<string>('SUPABASE_STORAGE_BUCKET')!;
  }

  async upload({ buffer, mimeType, pathHint }: { buffer: Buffer; mimeType: string; pathHint: string }) {
    const storagePath = `${randomUUID()}-${pathHint}`;
    const { error } = await this.client.storage.from(this.bucket).upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: false,
    });
    if (error) {
      this.logger.error(`Supabase storage upload failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to store uploaded file');
    }
    return { storagePath };
  }

  async getBuffer(storagePath: string): Promise<Buffer> {
    const { data, error } = await this.client.storage.from(this.bucket).download(storagePath);
    if (error || !data) {
      this.logger.error(`Supabase storage download failed: ${error?.message}`);
      throw new InternalServerErrorException('Failed to read stored file');
    }
    return Buffer.from(await data.arrayBuffer());
  }

  async delete(storagePath: string): Promise<void> {
    const { error } = await this.client.storage.from(this.bucket).remove([storagePath]);
    if (error) {
      this.logger.error(`Supabase storage delete failed: ${error.message}`);
      // Surface the failure so erasure/retention callers keep the DB row and retry.
      throw new InternalServerErrorException('Failed to delete stored file');
    }
  }
}
