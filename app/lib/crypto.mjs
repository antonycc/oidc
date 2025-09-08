import * as jose from "jose";
import { get, put, tables } from "./db.mjs";
import { log } from "./utils.mjs";

/**
 * Cryptographic operations for OIDC provider
 * Manages RSA key pairs for JWT signing and verification
 * Keys are persisted in DynamoDB for consistency across Lambda invocations
 */

// Stable keypair with DynamoDB persistence. In production, use S3/KMS for rotation.
let jwkPrivate,
  jwkPublic,
  kid = "kid-1";

/**
 * Load RSA key pair from DynamoDB store
 * @returns {Promise<boolean>} True if keys were successfully loaded
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
 * Save RSA key pair to DynamoDB store
 * @returns {Promise<void>}
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
 * Ensure RSA key pair is available, loading from store or generating if needed
 * @param {boolean} generateIfMissing - Whether to generate new keys if none exist
 * @returns {Promise<boolean>} True if keys are available
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
 * Sign a JWT token with the current private key
 * @param {object} payload - The payload to sign
 * @returns {Promise<string>} Signed JWT token
 */
export async function signJwt(payload) {
  const ok = await ensureKeys(true);
  if (!ok) throw new Error("signJwt: failed to ensure keys");
  const key = await jose.importJWK(jwkPrivate, "RS256");
  return await new jose.SignJWT(payload).setProtectedHeader({ alg: "RS256", kid }).sign(key);
}

/**
 * Get public JWKS (JSON Web Key Set) for token verification
 * @returns {Promise<object>} JWKS object containing public keys
 */
export async function publicJwks() {
  await ensureKeys(true);
  return { keys: [jwkPublic] };
}

let remoteJwkSet; // cached RemoteJWKSet function
let remoteJwksUrl; // cached URL string used to build RemoteJWKSet

/**
 * Verify and decode a JWT token
 * @param {string} token - The JWT token to verify
 * @returns {object|null} Decoded payload or null if invalid
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
