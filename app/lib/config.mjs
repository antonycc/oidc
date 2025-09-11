/**
 * Centralized configuration management with validation
 * Uses env-var for type-safe environment variable access
 */
import env from "env-var";

/**
 * Check if running in test environment
 */
const isTest = process.env.NODE_ENV === "test" || process.env.VITEST === "true";

/**
 * Application configuration with validation and defaults
 */
export const config = {
  // Core OIDC settings
  issuer: env
    .get("ISSUER")
    .default(isTest ? "https://test.issuer" : undefined)
    .asString(),

  // DynamoDB table names
  tables: {
    users: env.get("USERS_TABLE").asString(),
    codes: env.get("CODES_TABLE").asString(),
    refresh: env.get("REFRESH_TABLE").asString(),
  },

  // Token settings with defaults
  tokens: {
    accessTokenTtlSeconds: env.get("ACCESS_TOKEN_TTL").default(300).asIntPositive(),
    idTokenTtlSeconds: env.get("ID_TOKEN_TTL").default(300).asIntPositive(),
    authCodeTtlSeconds: env.get("AUTH_CODE_TTL").default(180).asIntPositive(),
  },

  // Crypto settings
  crypto: {
    keyRotationDays: env.get("KEY_ROTATION_DAYS").default(365).asIntPositive(),
  },
};

/**
 * Validate required configuration at startup (skip in tests)
 * @throws {Error} If required configuration is missing or invalid
 */
export function validateRequiredConfig() {
  if (isTest) return; // Skip validation in tests

  const errors = [];

  if (!config.issuer) {
    errors.push("ISSUER environment variable is required");
  }

  if (!config.tables.users && !config.tables.codes) {
    errors.push("At least one DynamoDB table must be configured");
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join("\n")}`);
  }
}

/**
 * Get configuration with runtime validation
 * @param {string} key - Configuration key path (e.g., 'tokens.accessTokenTtlSeconds')
 * @param {any} defaultValue - Default value if not found
 * @returns {any} Configuration value
 */
export function getConfig(key, defaultValue) {
  const keys = key.split(".");
  let value = config;

  for (const k of keys) {
    value = value?.[k];
    if (value === undefined) {
      return defaultValue;
    }
  }

  return value;
}
