import { verifyJwt } from "../lib/crypto.mjs";
import { get, tables } from "../lib/db.mjs";
import { log, logError, createJsonResponse } from "../lib/utils.mjs";

/**
 * OIDC UserInfo endpoint handler
 * Returns user information based on the provided access token
 *
 * @param {Object} event - Lambda event object
 * @param {Object} event.headers - Request headers
 * @param {string} event.headers.authorization - Bearer token authorization header
 * @returns {Promise<Object>} Lambda response object with user info or error
 */
// Handler expects an event object with headers
export const handler = async (event) => {
  try {
    log("userinfo_request");
    const authHeader = event?.headers?.authorization || event?.headers?.Authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return createJsonResponse(401, {
        error: "invalid_request",
        error_description: "Missing or invalid Authorization header",
      });
    }

    const accessToken = authHeader.slice("Bearer ".length);
    log("validating_access_token");

    // Verify the JWT access token
    const payload = await verifyJwt(accessToken);
    if (!payload) {
      return createJsonResponse(401, {
        error: "invalid_token",
        error_description: "Access token is invalid or expired",
      });
    }

    log("access_token_valid", "sub:", payload.sub);

    // Get user information from database if available
    let userInfo = { sub: payload.sub };

    if (process.env.USERS_TABLE && tables.users) {
      try {
        const userRecord = await get(tables.users, { username: payload.sub });
        if (userRecord.Item) {
          // Build user info based on requested scopes
          const scopes = payload.scope ? payload.scope.split(" ") : [];

          // Always include sub
          userInfo.sub = payload.sub;

          // Include email claims if email scope was requested
          if (scopes.includes("email") && userRecord.Item.email) {
            userInfo.email = userRecord.Item.email;
            userInfo.email_verified = userRecord.Item.emailVerified || false;
          }

          // Include profile claims if profile scope was requested
          if (scopes.includes("profile")) {
            if (userRecord.Item.name) userInfo.name = userRecord.Item.name;
            if (userRecord.Item.given_name) userInfo.given_name = userRecord.Item.given_name;
            if (userRecord.Item.family_name) userInfo.family_name = userRecord.Item.family_name;
            if (userRecord.Item.picture) userInfo.picture = userRecord.Item.picture;
          }

          log("userinfo_from_db", "scopes:", scopes.join(","));
        } else {
          log("user_not_found_in_db", payload.sub);
        }
      } catch (dbError) {
        log("userinfo_db_error", dbError.message);
        // Continue with basic userinfo if DB lookup fails
      }
    } else {
      log("no_users_table_configured");
    }

    return createJsonResponse(200, userInfo);
  } catch (e) {
    logError("userinfo_error", e);
    return createJsonResponse(500, { error: "server_error" });
  }
};
