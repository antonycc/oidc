import * as jose from "jose";

// Ephemeral keypair per cold start. In production, store in S3/KMS and rotate.
let jwkPrivate,
  jwkPublic,
  kid = "kid-1";

export async function ensureKeys() {
  if (!jwkPrivate) {
    const { privateKey, publicKey } = await jose.generateKeyPair("RS256", { modulusLength: 2048 });
    jwkPrivate = await jose.exportJWK(privateKey);
    jwkPrivate.kid = kid;
    jwkPrivate.use = "sig";
    jwkPrivate.alg = "RS256";
    jwkPublic = await jose.exportJWK(publicKey);
    jwkPublic.kid = kid;
    jwkPublic.use = "sig";
    jwkPublic.alg = "RS256";
  }
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
