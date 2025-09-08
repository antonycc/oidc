import * as jose from "jose";
import { get, put, tables } from "./db.mjs";
import { log } from "./utils.mjs";

/**
 * Cryptographic operations for JWT signing and verification
 * 
 * This module manages RSA key pairs for JWT token signing and verification.
 * Keys are persisted in DynamoDB for consistency across Lambda function invocations.
 * 
 * Key Management Strategy:
 * - RSA-2048 keys for RS256 JWT signatures
 * - Persistent storage in DynamoDB codes table
 * - Automatic key generation if none exist
 * - 1-year TTL for key rotation
 * 
 * Security Considerations:
 * - Private keys never logged or exposed
 * - Public keys served via JWKS endpoint
 * - Keys generated using Node.js crypto secure random
 */

// In-memory cache for loaded keys to avoid repeated DynamoDB calls
let jwkPrivate,  // RSA private key for signing (JWK format)
  jwkPublic,     // RSA public key for verification (JWK format)
  kid = "kid-1"; // Key identifier for JWT headers

/**
 * Load existing key pair from DynamoDB storage
 * 
 * @returns {Promise<boolean>} True if keys were successfully loaded from storage
 */
async function loadFromStore() {
  if (!tables.codes) return false; // No table available
  try {
    const result = await get(tables.codes, { code: "jwk-key-store" });
    if (result.Item && result.Item.privateKey && result.Item.publicKey) {
      jwkPrivate = result.Item.privateKey;
      jwkPublic = result.Item.publicKey;
      log("keys_loaded_from_store");
      return true;
    }
  } catch (error) {
    log("key_load_failed", error.message);
  }
  return false;
}

/**
 * Save current key pair to DynamoDB for persistence
 * 
 * Keys are stored with a 1-year TTL to enable automatic rotation.
 * Uses the codes table with a special key "jwk-key-store" for identification.
 * 
 * @returns {Promise<void>} Resolves when keys are saved or operation fails gracefully
 */
async function saveToStore() {
  if (!tables.codes || !jwkPrivate || !jwkPublic) return;
  try {
    await put(tables.codes, {
      code: "jwk-key-store",
      privateKey: jwkPrivate,
      publicKey: jwkPublic,
      ttl: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60, // 1 year TTL for key storage
    });
    log("keys_saved_to_store");
  } catch (error) {
    log("key_save_failed", error.message);
  }
}

/**
 * Ensure RSA key pair exists for JWT operations
 * 
 * This function implements a multi-step key loading strategy:
 * 1. Return cached keys if already loaded in memory
 * 2. Attempt to load existing keys from DynamoDB storage
 * 3. Generate new keys if none exist and generation is allowed
 * 
 * Key Generation:
 * - Uses RSA-2048 algorithm for RS256 JWT signatures
 * - Generates both private and public keys in JWK format
 * - Automatically saves new keys to DynamoDB for persistence
 * 
 * @param {boolean} generateIfMissing - Whether to generate new keys if none exist
 * @returns {Promise<boolean>} True if keys are available for use
 * 
 * @example
 * // In signing context (token endpoint)
 * await ensureKeys(true);  // Generate if missing
 * 
 * @example  
 * // In verification context (userinfo endpoint)
 * await ensureKeys(false); // Don't generate, use existing only
 */
export async function ensureKeys(generateIfMissing = true) {
  if (jwkPrivate && jwkPublic) return true;

  // Try to load existing keys from store
  if (await loadFromStore()) return true;

  if (!generateIfMissing) {
    // Do not generate keys in verifier contexts to avoid cross-function key mismatches
    return false;
  }
  // Generate new keys if none exist
  log("generating_new_keys");
  const { privateKey, publicKey } = await jose.generateKeyPair("RS256", { modulusLength: 2048 });
  jwkPrivate = await jose.exportJWK(privateKey);
  jwkPrivate.kid = kid;
  jwkPrivate.use = "sig";
  jwkPrivate.alg = "RS256";
  jwkPublic = await jose.exportJWK(publicKey);
  jwkPublic.kid = kid;
  jwkPublic.use = "sig";
  jwkPublic.alg = "RS256";

  // Save keys to store for future use
  await saveToStore();
  return true;
}

/**
 * Sign a JWT payload using the current RSA private key
 * 
 * Creates a JWT token signed with RS256 algorithm using the stored private key.
 * Automatically ensures keys exist before signing operation.
 * 
 * @param {object} payload - JWT payload object (claims)
 * @param {string} payload.sub - Subject identifier (required)
 * @param {string} payload.iss - Issuer URL (typically added by caller)
 * @param {number} payload.exp - Expiration timestamp (typically added by caller)
 * @param {number} payload.iat - Issued at timestamp (typically added by caller)
 * @returns {Promise<string>} Signed JWT token string
 * 
 * @throws {Error} If key generation or signing fails
 * 
 * @example
 * const token = await signJwt({
 *   sub: 'user-123',
 *   iss: 'https://oidc.example.com',
 *   aud: 'client-id',
 *   exp: Math.floor(Date.now() / 1000) + 3600,
 *   iat: Math.floor(Date.now() / 1000),
 *   email: 'user@example.com'
 * });
 */
export async function signJwt(payload) {
  const ok = await ensureKeys(true);
  if (!ok) throw new Error("signJwt: failed to ensure keys");
  const key = await jose.importJWK(jwkPrivate, "RS256");
  return await new jose.SignJWT(payload).setProtectedHeader({ alg: "RS256", kid }).sign(key);
}

/**
 * Generate JSON Web Key Set (JWKS) for public key distribution
 * 
 * Returns the public key in JWKS format for client token verification.
 * This endpoint is called by clients to retrieve verification keys.
 * 
 * @returns {Promise<object>} JWKS object containing public keys array
 * 
 * @example
 * const jwks = await publicJwks();
 * // Returns: { keys: [{ kty: "RSA", use: "sig", alg: "RS256", ... }] }
 */
export async function publicJwks() {
  await ensureKeys(true);
  return { keys: [jwkPublic] };
}

// Cached RemoteJWKSet for efficient key retrieval during verification
let remoteJwkSet; // cached RemoteJWKSet function
let remoteJwksUrl; // cached URL string used to build RemoteJWKSet

/**
 * Verify and decode a JWT token using local or remote keys
 * 
 * This function implements a two-stage verification process:
 * 1. Local verification using cached keys (fastest)
 * 2. Remote JWKS verification if local keys fail (for key rotation scenarios)
 * 
 * Security Features:
 * - Enforces canonical base64url encoding to prevent signature malleability
 * - Validates issuer claim against expected value
 * - Only accepts RS256 algorithm for security
 * - Graceful fallback to remote key verification
 * 
 * @param {string} token - The JWT token to verify
 * @returns {Promise<object|null>} Decoded payload or null if verification fails
 * 
 * @example
 * const payload = await verifyJwt(accessToken);
 * if (payload) {
 *   console.log('User:', payload.sub);
 *   console.log('Expires:', new Date(payload.exp * 1000));
 * }
 */
export async function verifyJwt(token) {
  const issuer = process.env.ISSUER;

  // Enforce canonical base64url encoding of the compact JWS signature segment.
  // Some base64url variants can decode to the same bytes even if the last character differs
  // (unused bits in the final sextet). We reject non-canonical encodings to prevent
  // acceptance of cosmetically modified tokens.
  function isCanonicalJwsSignature(compact) {
    try {
      const parts = String(compact).split(".");
      if (parts.length !== 3) return false;
      const sigBytes = Buffer.from(parts[2], "base64url");
      const canonical = sigBytes.toString("base64url").replace(/=+$/, "");
      return parts[2] === canonical;
    } catch {
      return false;
    }
  }

  try {
    // Attempt local key verification first (no key generation in verifier)
    const haveKeys = await ensureKeys(false);
    if (haveKeys) {
      const key = await jose.importJWK(jwkPublic, "RS256");
      const { payload } = await jose.jwtVerify(token, key, {
        issuer,
        algorithms: ["RS256"],
      });
      if (!isCanonicalJwsSignature(token)) return null;
      return payload;
    }
  } catch (e) {
    // Fall through to remote JWKS verification
    log("local_jwk_verification_failed", e?.message || String(e));
  }

  // Remote JWKS fallback
  try {
    if (!issuer) throw new Error("ISSUER is not configured");
    const url = new URL("/jwks", issuer).toString();
    if (!remoteJwkSet || remoteJwksUrl !== url) {
      remoteJwkSet = jose.createRemoteJWKSet(new URL(url));
      remoteJwksUrl = url;
    }
    const { payload } = await jose.jwtVerify(token, remoteJwkSet, {
      issuer,
      algorithms: ["RS256"],
    });
    if (!isCanonicalJwsSignature(token)) return null;
    return payload;
  } catch (error) {
    console.error("jwt_verification_failed", error.message || String(error));
    return null;
  }
}
