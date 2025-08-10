import { z } from 'zod';
import { SafeUserSchema, UserRegistrationSchema } from '../user';

// Authentication-related schemas and types

/**
 * Schema for passkey registration options
 */
export const PasskeyRegistrationOptionsSchema = z.object({
  userId: z.string(),
  options: z.any(), // WebAuthn options are complex, keeping as any for now
  challenge: z.string(),
});

/**
 * Schema for registration start response
 */
export const RegistrationResponseSchema = z.object({
  success: z.boolean(),
  user: SafeUserSchema,
  registrationOptions: PasskeyRegistrationOptionsSchema,
  sessionId: z.string(),
  message: z.string(),
});

/**
 * Schema for complete registration request body
 */
export const CompleteRegistrationRequestSchema = z.object({
  sessionId: z.string(),
  credential: z.any(), // RegistrationResponseJSON is complex, keeping as any
});

/**
 * Schema for user credential in response
 */
export const UserCredentialResponseSchema = z.object({
  id: z.string(),
  deviceType: z.string().optional(),
  backedUp: z.boolean(),
  createdAt: z.date(),
});

/**
 * Schema for auth user (lighter than SafeUser)
 */
export const AuthUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  name: z.string(),
});

/**
 * Schema for complete registration response
 */
export const CompleteRegistrationResponseSchema = z.object({
  success: z.boolean(),
  user: AuthUserSchema,
  credential: UserCredentialResponseSchema,
  accessToken: z.string(),
  refreshToken: z.string(),
  message: z.string(),
});

/**
 * Schema for login start response
 */
export const LoginStartResponseSchema = z.object({
  success: z.boolean(),
  options: z.any(), // WebAuthn options
  sessionId: z.string(),
});

/**
 * Schema for complete login request body
 */
export const CompleteLoginRequestSchema = z.object({
  sessionId: z.string(),
  credential: z.any(), // AuthenticationResponseJSON is complex
});

/**
 * Schema for complete login response
 */
export const CompleteLoginResponseSchema = z.object({
  success: z.boolean(),
  user: AuthUserSchema,
  accessToken: z.string(),
  refreshToken: z.string(),
  message: z.string(),
});

/**
 * Schema for token refresh request body
 */
export const TokenRefreshRequestSchema = z.object({
  refreshToken: z.string(),
});

/**
 * Schema for token refresh response
 */
export const TokenRefreshResponseSchema = z.object({
  success: z.boolean(),
  accessToken: z.string(),
  refreshToken: z.string(),
  message: z.string(),
});

/**
 * Schema for logout request body
 */
export const LogoutRequestSchema = z.object({
  refreshToken: z.string(),
});

/**
 * Schema for logout response
 */
export const LogoutResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

/**
 * Schema for error responses
 */
export const AuthErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
});

// Derived types from schemas
export type PasskeyRegistrationOptions = z.infer<
  typeof PasskeyRegistrationOptionsSchema
>;
export type RegistrationResponse = z.infer<typeof RegistrationResponseSchema>;
export type CompleteRegistrationRequest = z.infer<
  typeof CompleteRegistrationRequestSchema
>;
export type UserCredentialResponse = z.infer<
  typeof UserCredentialResponseSchema
>;
export type AuthUser = z.infer<typeof AuthUserSchema>;
export type CompleteRegistrationResponse = z.infer<
  typeof CompleteRegistrationResponseSchema
>;
export type LoginStartResponse = z.infer<typeof LoginStartResponseSchema>;
export type CompleteLoginRequest = z.infer<typeof CompleteLoginRequestSchema>;
export type CompleteLoginResponse = z.infer<typeof CompleteLoginResponseSchema>;
// Alias for backwards compatibility
export type TokenRefreshRequest = z.infer<typeof TokenRefreshRequestSchema>;
export type TokenRefreshResponse = z.infer<typeof TokenRefreshResponseSchema>;
export type LogoutRequest = z.infer<typeof LogoutRequestSchema>;
export type LogoutResponse = z.infer<typeof LogoutResponseSchema>;
export type AuthErrorResponse = z.infer<typeof AuthErrorResponseSchema>;
