import { z } from 'zod';

/** The word the user types to confirm deleting their account. */
export const DELETE_ACCOUNT_CONFIRMATION = 'DELETE';

/**
 * DELETE /auth/me body. `confirmation` is always required (typed
 * confirmation); `password` is additionally required, and checked by the API,
 * for accounts that sign in with a password.
 */
export const DeleteAccountSchema = z.object({
  confirmation: z.literal(DELETE_ACCOUNT_CONFIRMATION, {
    errorMap: () => ({ message: `Type ${DELETE_ACCOUNT_CONFIRMATION} to confirm` }),
  }),
  password: z.string().min(1).max(200).optional(),
});
export type DeleteAccountInput = z.infer<typeof DeleteAccountSchema>;
