import * as jose from "jose";
import { get, put, tables } from "./db.mjs";

// Persistent keypair stored in DynamoDB (codes table) to share across Lambdas
let jwkPrivate,
  jwkPublic,
  kid = "kid-1";

  } catch (err) {
    console.error("Error loading JWKS from store:", err);
  }
  return false;
}

async function saveToStore() {
  if (!tables.codes) return;
  try {
    await put(tables.codes, { code: "__JWKS__", priv: jwkPrivate, pub: jwkPublic });
  } catch {}
}

export async function ensureKeys() {
  if (jwkPrivate && jwkPublic) return;
  // Try load
  if (await loadFromStore()) return;
  // Generate new
  const { privateKey, publicKey } = await jose.generateKeyPair("RS256", { modulusLength: 2048 });
  jwkPrivate = await jose.exportJWK(privateKey);
  jwkPrivate.kid = kid;
  jwkPrivate.use = "sig";
  jwkPrivate.alg = "RS256";
  jwkPublic = await jose.exportJWK(publicKey);
  jwkPublic.kid = kid;
  jwkPublic.use = "sig";
  jwkPublic.alg = "RS256";
  await saveToStore();
}

export async function signJwt(payload) {
  await ensureKeys();
  const key = await jose.importJWK(jwkPrivate, "RS256");
  return await new jose.SignJWT(payload).setProtectedHeader({ alg: "RS256", kid }).sign(key);
}

export function publicJwks() {
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
