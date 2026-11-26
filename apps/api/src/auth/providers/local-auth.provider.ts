import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

import { AuthProvider } from './auth-provider.interface';

const BCRYPT_ROUNDS = 12;

/**
 * Default provider: passwords are hashed and stored on User.passwordHash in
 * our own database. Swapped for SupabaseAuthProvider once Supabase
 * credentials are configured (see AuthModule's provider factory).
 */
@Injectable()
export class LocalAuthProvider implements AuthProvider {
  async createCredential({ password }: { email: string; password: string; fullName: string }) {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    return { externalId: null, passwordHash };
  }

  async verifyCredential({
    password,
    storedPasswordHash,
  }: {
    email: string;
    password: string;
    storedPasswordHash: string | null;
    externalId: string | null;
  }) {
    if (!storedPasswordHash) return false;
    return bcrypt.compare(password, storedPasswordHash);
  }

  async updateCredentialPassword({ newPassword }: { email: string; externalId: string | null; newPassword: string }) {
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    return { passwordHash };
  }

  async deleteCredential(): Promise<void> {
    // No external system to clean up — the User row deletion is enough.
  }
}
