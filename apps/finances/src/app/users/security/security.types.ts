import { z } from 'zod';

// Security-related schemas and types

/**
 * Schema for delete passkey response
 */
export const DeletePasskeyResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

/**
 * Schema for revoke all sessions response
 */
export const RevokeAllSessionsResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

/**
 * Schema for passkey credential ID parameter
 */
export const PasskeyCredentialIdParamSchema = z.object({
  credentialId: z.string(),
});

// Derived types from schemas
export type DeletePasskeyResponse = z.infer<typeof DeletePasskeyResponseSchema>;
export type RevokeAllSessionsResponse = z.infer<
  typeof RevokeAllSessionsResponseSchema
>;
export type PasskeyCredentialIdParam = z.infer<
  typeof PasskeyCredentialIdParamSchema
>;
