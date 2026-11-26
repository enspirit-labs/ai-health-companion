/**
 * Decouples the rest of the app from *which* identity provider owns a
 * credential (email+password stored locally, vs. delegated to Supabase
 * Auth). AuthService owns the User row and password-reset-token bookkeeping
 * uniformly for both providers; a provider only knows how to establish,
 * verify, and update the underlying credential. AuthService always mints
 * its own JWT afterwards, so guards/controllers never need to know which
 * provider is active.
 */
export interface AuthProvider {
  createCredential(params: {
    email: string;
    password: string;
    fullName: string;
  }): Promise<{ externalId: string | null; passwordHash: string | null }>;

  verifyCredential(params: {
    email: string;
    password: string;
    storedPasswordHash: string | null;
    externalId: string | null;
  }): Promise<boolean>;

  /** Called once AuthService has already validated the reset token itself. */
  updateCredentialPassword(params: {
    email: string;
    externalId: string | null;
    newPassword: string;
  }): Promise<{ passwordHash: string | null }>;

  deleteCredential(params: { externalId: string | null; email: string }): Promise<void>;
}

export const AUTH_PROVIDER = Symbol('AUTH_PROVIDER');
