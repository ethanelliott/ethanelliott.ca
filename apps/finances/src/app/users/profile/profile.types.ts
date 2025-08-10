import { z } from 'zod';
import { SafeUserSchema } from '../user';

// Profile-related schemas and types

/**
 * Schema for individual credential in profile response
 */
export const ProfileCredentialSchema = z.object({
  id: z.string(),
  deviceType: z.string().optional(),
  backedUp: z.boolean(),
  createdAt: z.date(),
  lastUsed: z.date(),
});

/**
 * Schema for get profile response
 */
export const ProfileResponseSchema = z.object({
  success: z.boolean(),
  user: SafeUserSchema,
  credentials: z.array(ProfileCredentialSchema),
  hasPassword: z.boolean(),
  securityScore: z.number(),
});

/**
 * Schema for update profile request body
 */
export const UpdateProfileRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

/**
 * Schema for update profile response
 */
export const UpdateProfileResponseSchema = z.object({
  success: z.boolean(),
  user: SafeUserSchema,
  message: z.string(),
});

/**
 * Schema for delete account response
 */
export const DeleteAccountResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

// Derived types from schemas
export type ProfileCredential = z.infer<typeof ProfileCredentialSchema>;
export type ProfileResponse = z.infer<typeof ProfileResponseSchema>;
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;
export type UpdateProfileResponse = z.infer<typeof UpdateProfileResponseSchema>;
export type DeleteAccountResponse = z.infer<typeof DeleteAccountResponseSchema>;
