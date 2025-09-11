import bcrypt from "bcryptjs";
import { ulid } from "ulid";

/**
 * Generate test credentials for deployment-time provisioning and testing.
 * Returns both plaintext password for UI display and hashed password for storage.
 */
export function generateTestCredentials() {
  const username = "demo-user";
  const password = ulid().toLowerCase(); // Generate a ULID for password to ensure uniqueness
  const passwordHash = bcrypt.hashSync(password, 10);

  return {
    username,
    password,
    passwordHash,
    email: `${username}@example.com`,
    name: "Demo User",
    given_name: "Demo",
    family_name: "User",
  };
}

/**
 * Generate credentials for testing purposes, optionally with a prefix
 */
export function generateTestCredentialsForTest(prefix = "test") {
  const username = `${prefix}-${ulid().toLowerCase().substring(0, 8)}`;
  const password = ulid().toLowerCase();
  const passwordHash = bcrypt.hashSync(password, 10);

  return {
    username,
    password,
    passwordHash,
    email: `${username}@example.com`,
    name: `${prefix.charAt(0).toUpperCase() + prefix.slice(1)} User`,
    given_name: prefix.charAt(0).toUpperCase() + prefix.slice(1),
    family_name: "User",
  };
}

/**
 * CLI entry point for generating credentials
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const credentials = generateTestCredentials();
  // Print non-sensitive info
  const { password, ...publicCredentials } = credentials;
  console.log("Generated test credentials:");
  console.log(JSON.stringify(publicCredentials, null, 2));
  // Optionally print password with a warning (remove this if not needed)
}
