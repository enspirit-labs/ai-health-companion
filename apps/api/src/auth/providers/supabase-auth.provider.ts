import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { AuthProvider } from './auth-provider.interface';

/**
 * Delegates credential storage and verification to Supabase Auth. Activated
 * automatically once SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
 * are set — see AuthModule's provider factory. Password-reset-token
 * verification itself still happens in AuthService (identical flow to the
 * local provider); this provider is only responsible for the Supabase side
 * of creating, authenticating, and updating the credential.
 *
 * Nest always instantiates this provider (even when the local provider is the
 * active one), so the Supabase client must be created lazily — constructing
 * it eagerly would throw at boot whenever Supabase env vars are unset.
 */
@Injectable()
export class SupabaseAuthProvider implements AuthProvider {
  private readonly logger = new Logger(SupabaseAuthProvider.name);
  private adminClientInstance: SupabaseClient | undefined;

  constructor(private readonly config: ConfigService) {}

  private get url(): string {
    return this.config.get<string>('SUPABASE_URL')!;
  }

  private get anonKey(): string {
    return this.config.get<string>('SUPABASE_ANON_KEY')!;
  }

  private get adminClient(): SupabaseClient {
    if (!this.adminClientInstance) {
      const serviceRoleKey = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY')!;
      this.adminClientInstance = createClient(this.url, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    }
    return this.adminClientInstance;
  }

  async createCredential({ email, password, fullName }: { email: string; password: string; fullName: string }) {
    const { data, error } = await this.adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { fullName },
    });

    if (error || !data.user) {
      this.logger.error(`Supabase createUser failed for ${email}: ${error?.message}`);
      throw new InternalServerErrorException('Failed to create account');
    }

    return { externalId: data.user.id, passwordHash: null };
  }

  async verifyCredential({ email, password }: { email: string; password: string }) {
    // Sign-in must go through the anon client — the admin client has no
    // password-grant endpoint.
    const anonClient = createClient(this.url, this.anonKey);
    const { error } = await anonClient.auth.signInWithPassword({ email, password });
    return !error;
  }

  async updateCredentialPassword({ externalId, newPassword }: { email: string; externalId: string | null; newPassword: string }) {
    if (!externalId) {
      throw new InternalServerErrorException('Missing Supabase user id for password update');
    }
    const { error } = await this.adminClient.auth.admin.updateUserById(externalId, { password: newPassword });
    if (error) {
      this.logger.error(`Supabase password update failed: ${error.message}`);
      throw new InternalServerErrorException('Failed to update password');
    }
    return { passwordHash: null };
  }

  async deleteCredential({ externalId }: { externalId: string | null; email: string }): Promise<void> {
    if (!externalId) return;
    const { error } = await this.adminClient.auth.admin.deleteUser(externalId);
    if (error) {
      this.logger.error(`Supabase deleteUser failed: ${error.message}`);
    }
  }
}
