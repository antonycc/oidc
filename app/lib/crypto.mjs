import * as jose from "jose";
import { get, put, tables } from "./db.mjs";

const log = (...a) => console.log(JSON.stringify({ level: "info", ts: new Date().toISOString(), msg: a.join(" ") }));

// Stable keypair with DynamoDB persistence. In production, use S3/KMS for rotation.
let jwkPrivate,
  jwkPublic,
  kid = "kid-1";

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

async function saveToStore() {
  if (!tables.codes || !jwkPrivate || !jwkPublic) return;
  try {
    await put(tables.codes, {
      code: "jwk-key-store",
      privateKey: jwkPrivate,
      publicKey: jwkPublic,
      ttl: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60), // 1 year TTL for key storage
    });
    log("keys_saved_to_store");
  } catch (error) {
    log("key_save_failed", error.message);
  }
}

export async function ensureKeys() {
  if (jwkPrivate && jwkPublic) return;
  
  // Try to load existing keys from store
  if (await loadFromStore()) return;
  
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
}

export async function signJwt(payload) {
  await ensureKeys();
  const key = await jose.importJWK(jwkPrivate, "RS256");
  return await new jose.SignJWT(payload).setProtectedHeader({ alg: "RS256", kid }).sign(key);
}

export async function publicJwks() {
  await ensureKeys();
  return { keys: [jwkPublic] };
}

/**
 * Verify and decode a JWT token
 * @param {string} token - The JWT token to verify
 * @returns {object|null} Decoded payload or null if invalid
 */
export async function verifyJwt(token) {
  try {
    await ensureKeys();
    const key = await jose.importJWK(jwkPublic, "RS256");
    const { payload } = await jose.jwtVerify(token, key, {
      issuer: process.env.ISSUER,
      algorithms: ["RS256"]
    });
    return payload;
  } catch (error) {
    console.error("jwt_verification_failed", error.message);
    return null;
  }
}
