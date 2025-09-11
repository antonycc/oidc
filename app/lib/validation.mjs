/**
 * Validation schemas for OIDC parameters using Zod
 * Provides type-safe validation and consistent error handling
 */
import { z } from "zod";

/**
 * Common string patterns for OIDC
 */
const patterns = {
  clientId: z.string().min(1).max(255),
  redirectUri: z.string().min(1), // Let business logic validate URL format
  scope: z.string().min(1),
  state: z.string().min(1).max(1024),
  nonce: z.string().min(1).max(1024).optional(),
  code: z.string().min(1).max(128),
  codeChallenge: z.string().min(1).max(128), // Let business logic validate PKCE format
  codeVerifier: z.string().min(1).max(128), // Let business logic validate PKCE format
  username: z.string().min(1).max(255),
  password: z.string().min(1).max(255),
};

/**
 * Authorization endpoint request validation
 */
export const authorizeRequestSchema = z.object({
  client_id: patterns.clientId,
  redirect_uri: patterns.redirectUri,
  response_type: z.literal("code"),
  scope: patterns.scope,
  state: patterns.state,
  nonce: patterns.nonce,
  code_challenge: patterns.codeChallenge.optional(),
  code_challenge_method: z.enum(["S256"]).optional(),
  username: patterns.username.optional(),
  password: patterns.password.optional(),
});

/**
 * Token endpoint request validation
 */
export const tokenRequestSchema = z.object({
  grant_type: z.literal("authorization_code"),
  code: patterns.code,
  client_id: patterns.clientId,
  redirect_uri: patterns.redirectUri,
  code_verifier: patterns.codeVerifier.optional(),
  client_secret: z.string().optional(),
});

/**
 * User creation/validation schema
 */
export const userSchema = z.object({
  username: patterns.username,
  password: patterns.password,
  email: z.string().email().optional(),
  name: z.string().max(255).optional(),
  given_name: z.string().max(255).optional(),
  family_name: z.string().max(255).optional(),
  emailVerified: z.boolean().default(false),
});

/**
 * Authorization code storage schema
 */
export const authCodeSchema = z.object({
  code: patterns.code,
  client: patterns.clientId,
  redirect: patterns.redirectUri,
  scope: patterns.scope,
  sub: patterns.username,
  nonce: patterns.nonce,
  ch: patterns.codeChallenge.optional(), // code_challenge
  ccm: z.enum(["S256"]).optional(), // code_challenge_method
  used: z.boolean().default(false),
  ttl: z.number().int().positive(),
});

/**
 * Validate and parse OIDC request parameters
 * @param {Object} params - Parameters to validate
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @returns {Object} Parsed and validated parameters
 * @throws {z.ZodError} If validation fails
 */
export function validateParams(params, schema) {
  return schema.parse(params);
}

/**
 * Safe validation that returns errors instead of throwing
 * @param {Object} params - Parameters to validate
 * @param {z.ZodSchema} schema - Zod schema to validate against
 * @returns {Object} { success: boolean, data?: any, errors?: string[] }
 */
export function safeValidateParams(params, schema) {
  const result = schema.safeParse(params);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = result.error?.issues?.map((err) => `${err.path.join(".")}: ${err.message}`) || ["Validation failed"];

  return { success: false, errors };
}

/**
 * Validate required scopes are present
 * @param {string} requestedScopes - Space-separated scopes
 * @param {string[]} requiredScopes - Array of required scopes
 * @returns {boolean} True if all required scopes are present
 */
export function validateScopes(requestedScopes, requiredScopes = []) {
  if (requiredScopes.length === 0) return true;

  const requested = requestedScopes.split(" ");
  return requiredScopes.every((scope) => requested.includes(scope));
}

/**
 * PKCE validation utilities
 */
export const pkce = {
  /**
   * Validate PKCE code challenge format
   */
  validateChallenge: z
    .string()
    .min(43)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/),

  /**
   * Validate PKCE code verifier format
   */
  validateVerifier: z
    .string()
    .min(43)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/),

  /**
   * Validate challenge method
   */
  validateMethod: z.enum(["S256"]),
};
