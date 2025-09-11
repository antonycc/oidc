/**
 * JWT Operations
 * Abstracts JWT creation and validation operations for OIDC tokens
 */
import { signJwt, verifyJwt } from "./crypto.mjs";
import { get, tables } from "./db.mjs";
import { jwt } from "./time.mjs";
import { config } from "./config.mjs";
import { log, logError } from "./utils.mjs";

/**
 * Creates an ID token with standard and optional claims
 * @param {Object} tokenData - Token generation data
 * @param {string} tokenData.sub - Subject identifier
 * @param {string} tokenData.aud - Audience (client_id)
 * @param {string} tokenData.scope - Requested scopes
 * @param {string} [tokenData.nonce] - Nonce from authorization request
 * @returns {Promise<string>} Signed ID token
 */
export const createIdToken = async (tokenData) => {
  const { sub, aud, scope, nonce } = tokenData;
  const iss = config.issuer;
  const iat = jwt.issuedAt();

  // Build base ID token claims
  const idTokenClaims = {
    iss,
    sub,
    aud,
    iat,
    exp: jwt.expiresIn(config.tokens.idTokenTtlSeconds),
    ...(nonce && { nonce }),
  };

  // Add user claims if available and scope permits
  if (config.tables.users && tables.users) {
    try {
      const userClaims = await getUserClaims(sub, scope);
      Object.assign(idTokenClaims, userClaims);
    } catch (error) {
      logError("user_claims_lookup_failed", error, { sub });
      // Continue without user claims if lookup fails
    }
  }

  return await signJwt(idTokenClaims);
};

/**
 * Creates an access token
 * @param {Object} tokenData - Token generation data
 * @param {string} tokenData.sub - Subject identifier
 * @param {string} tokenData.aud - Audience (client_id)
 * @param {string} tokenData.scope - Granted scopes
 * @returns {Promise<string>} Signed access token
 */
export const createAccessToken = async (tokenData) => {
  const { sub, aud, scope } = tokenData;
  const iss = config.issuer;
  const iat = jwt.issuedAt();

  const accessTokenClaims = {
    iss,
    sub,
    aud,
    iat,
    exp: jwt.expiresIn(config.tokens.accessTokenTtlSeconds),
    scope,
  };

  return await signJwt(accessTokenClaims);
};

/**
 * Creates both ID and access tokens for token endpoint response
 * @param {Object} tokenData - Token generation data
 * @returns {Promise<Object>} Token response object
 */
export const createTokenPair = async (tokenData) => {
  // Create tokens sequentially to avoid race conditions in key generation
  const id_token = await createIdToken(tokenData);
  const access_token = await createAccessToken(tokenData);

  log("tokens_issued", { sub: tokenData.sub, client: tokenData.aud });

  return {
    id_token,
    access_token,
    token_type: "Bearer",
    expires_in: config.tokens.accessTokenTtlSeconds,
  };
};

/**
 * Validates and extracts access token payload
 * @param {string} accessToken - Access token to validate
 * @returns {Promise<Object|null>} Token payload or null if invalid
 */
export const validateAccessToken = async (accessToken) => {
  try {
    const payload = await verifyJwt(accessToken);
    if (payload) {
      log("access_token_valid", "sub:", payload.sub);
      return payload;
    } else {
      logError("access_token_invalid", null);
      return null;
    }
  } catch (error) {
    logError("access_token_validation_error", error);
    return null;
  }
};

/**
 * Retrieves user claims based on requested scopes
 * @param {string} username - Username to look up
 * @param {string} scope - Requested scopes string
 * @returns {Promise<Object>} User claims object
 */
export const getUserClaims = async (username, scope) => {
  if (!config.tables.users || !tables.users) {
    return {};
  }

  try {
    const userRecord = await get(tables.users, { username });
    if (!userRecord.Item) {
      log("user_not_found_in_db", username);
      return {};
    }

    const scopes = scope ? scope.split(" ") : [];
    const claims = {};

    // Include email claims if email scope was requested
    if (scopes.includes("email") && userRecord.Item.email) {
      claims.email = userRecord.Item.email;
      claims.email_verified = userRecord.Item.emailVerified || false;
    }

    // Include profile claims if profile scope was requested
    if (scopes.includes("profile")) {
      if (userRecord.Item.name) claims.name = userRecord.Item.name;
      if (userRecord.Item.given_name) claims.given_name = userRecord.Item.given_name;
      if (userRecord.Item.family_name) claims.family_name = userRecord.Item.family_name;
      if (userRecord.Item.picture) claims.picture = userRecord.Item.picture;
    }

    log("user_claims_added", "scopes:", scopes.join(","));
    return claims;
  } catch (error) {
    logError("user_claims_retrieval_error", error, { username });
    return {};
  }
};

/**
 * Creates userinfo response based on access token
 * @param {string} accessToken - Validated access token
 * @returns {Promise<Object>} Userinfo response object
 */
export const createUserinfoResponse = async (accessToken) => {
  const payload = await validateAccessToken(accessToken);
  if (!payload) {
    return null;
  }

  // Build user info response
  const userInfo = { sub: payload.sub };

  if (config.tables.users && tables.users) {
    try {
      const userClaims = await getUserClaims(payload.sub, payload.scope);
      Object.assign(userInfo, userClaims);
    } catch (error) {
      logError("userinfo_db_error", error);
      // Continue with basic userinfo if DB lookup fails
    }
  } else {
    log("no_users_table_configured");
  }

  return userInfo;
};
