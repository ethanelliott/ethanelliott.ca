import { z } from 'zod';
import { SafeUserSchema } from '../user';

export const ProfileCredentialSchema = z.object({
  id: z.string(),
  deviceType: z.string().optional(),
  backedUp: z.boolean(),
  createdAt: z.date(),
  lastUsed: z.date(),
});

export const ProfileResponseSchema = z.object({
  success: z.boolean(),
  user: SafeUserSchema,
  credentials: z.array(ProfileCredentialSchema),
});

export const UpdateProfileRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
});

export const UpdateProfileResponseSchema = z.object({
  success: z.boolean(),
  user: SafeUserSchema,
  message: z.string(),
});

export const DeleteAccountResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export type ProfileCredential = z.infer<typeof ProfileCredentialSchema>;
export type ProfileResponse = z.infer<typeof ProfileResponseSchema>;
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;
export type UpdateProfileResponse = z.infer<typeof UpdateProfileResponseSchema>;
export type DeleteAccountResponse = z.infer<typeof DeleteAccountResponseSchema>;
