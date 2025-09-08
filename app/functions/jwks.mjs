import { publicJwks } from "../lib/crypto.mjs";
import { log, logError, createJsonResponse } from "../lib/utils.mjs";

/**
 * OIDC JWKS (JSON Web Key Set) endpoint handler
 * 
 * Returns the public cryptographic keys used for JWT token verification according to
 * RFC 7517 (JSON Web Key) and RFC 7518 (JSON Web Algorithms) specifications.
 * 
 * **Purpose:**
 * - Provides public keys for verifying JWT tokens (access tokens, ID tokens)
 * - Enables clients and resource servers to validate token authenticity
 * - Supports key rotation without breaking existing integrations
 * - Critical component of the OIDC trust infrastructure
 * 
 * **Key Specifications:**
 * - Algorithm: RS256 (RSA Signature with SHA-256)
 * - Key Type: RSA public keys
 * - Key Usage: Digital signature verification only
 * - Key ID (kid): Unique identifier for each key
 * - Key Rotation: Automatic generation and rotation for security
 * 
 * **Caching Strategy:**
 * - HTTP Cache-Control: public, max-age=3600 (1 hour caching)
 * - Keys are relatively stable but rotate periodically
 * - Clients should refresh JWKS when token verification fails
 * - Balances performance with security requirements
 * 
 * **Security Features:**
 * - Only public keys exposed (private keys never leave secure storage)
 * - Automatic key generation on first access
 * - Secure storage in DynamoDB with TTL policies
 * - Comprehensive error handling with safe fallbacks
 * 
 * **Flow:**
 * 1. Retrieves current public keys from crypto library
 * 2. Formats keys according to JWKS specification
 * 3. Sets appropriate cache headers for performance
 * 4. Returns JSON Web Key Set response
 * 
 * **Error Handling:**
 * - Key generation/retrieval failures → 500 server_error
 * - Database connectivity issues → 500 server_error
 * - No caching on error responses to prevent stale data
 * - Comprehensive logging for troubleshooting
 * 
 * @param {Object} event - AWS Lambda event object from Function URL (unused for JWKS)
 * @param {Object} [event.requestContext] - Request context (optional, not used)
 * @returns {Promise<Object>} Lambda response object with JWKS (200) or error (500)
 * 
 * @example
 * // Example JWKS response:
 * // {
 * //   "keys": [
 * //     {
 * //       "kty": "RSA",
 * //       "use": "sig", 
 * //       "kid": "2024-01-15",
 * //       "n": "0vx7agoebGcQSuuPiLJXZptN9nndrQmbPFRP_gdHPfBB...",
 * //       "e": "AQAB",
 * //       "alg": "RS256"
 * //     }
 * //   ]
 * // }
 * 
 * @see {@link https://tools.ietf.org/html/rfc7517} JSON Web Key (JWK) Specification
 * @see {@link https://tools.ietf.org/html/rfc7518} JSON Web Algorithms (JWA) Specification
 * @see {@link https://openid.net/specs/openid-connect-discovery-1_0.html#ProviderMetadata} OIDC Discovery
 */
export const handler = async (event) => {
  try {
    log("jwks_request");

    // Get the current public keys
    const jwks = await publicJwks();

    return createJsonResponse(200, jwks, {
      "cache-control": "public, max-age=3600", // Cache for 1 hour since keys are stable
    });
  } catch (e) {
    logError("jwks_error", e);
    return createJsonResponse(500, { error: "server_error" }, { "cache-control": "no-store" });
  }
};
