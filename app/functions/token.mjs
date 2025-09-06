import * as crypto from "node:crypto";
import { get, conditionalDelete, put, update, tables } from "../lib/db.mjs";
import { signJwt } from "../lib/crypto.mjs";
import { validateClientAuth, isPkceRequired } from "../lib/clients.mjs";
const safeStringify = (val) => {
  try {
    if (val instanceof Error) {
      return JSON.stringify({ name: val.name, message: val.message, stack: val.stack });
    }
    if (typeof val === "object") {
      return JSON.stringify(val);
    }
    return String(val);
  } catch {
    return String(val);
  }
};

// Mask sensitive data in logs for security compliance
const maskSensitive = (value, showLength = true) => {
  if (!value) return "null";
  const str = String(value);
  if (str.length <= 4) return "***";
  return showLength ? `***${str.length}chars` : "***";
};

const log = (...a) => console.log(JSON.stringify({ level: "info", ts: new Date().toISOString(), msg: a.map(safeStringify).join(" ") }));
const logError = (msg, err, extra) => {
  const payload = { level: "error", ts: new Date().toISOString(), msg: safeStringify(msg) };
  if (err) payload.err = err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err;
  if (extra !== undefined) payload.extra = extra;
  console.error(JSON.stringify(payload));
};

function parseFormBody(event) {
  try {
    let raw = event.body || "";
    if (event.isBase64Encoded && typeof raw === "string") {
      raw = Buffer.from(raw, "base64").toString("utf8");
    }
    const headers = event.headers || {};
    const ct = (headers["content-type"] || headers["Content-Type"] || "").toString().toLowerCase();
    if (ct.includes("application/json")) {
      try {
        const obj = JSON.parse(raw || "{}");
        const usp = new URLSearchParams();
        for (const [k, v] of Object.entries(obj)) {
          if (v !== undefined && v !== null) usp.set(k, String(v));
        }
        return usp;
      } catch {
        // fall through to URLSearchParams parsing
      }
    }
    // Default: treat as URL-encoded form data
    return new URLSearchParams(raw || "");
  } catch {
    return new URLSearchParams();
  }
}

export const handler = async (event) => {
  try {
    if (event.requestContext.http.method !== "POST") return json(405, { error: "method_not_allowed" });

    const body = parseFormBody(event);
    const grant = body.get("grant_type");
    if (grant !== "authorization_code") return json(400, { error: "unsupported_grant_type" });

    const code = body.get("code");
    const verifier = body.get("code_verifier") || "";

    const clientId = body.get("client_id");
    const redirectUri = body.get("redirect_uri");

    log("token_request", clientId, redirectUri, code ? `has_code: ${maskSensitive(code)}` : "no_code");
    
    // Validate required parameters
    if (!code || !clientId || !redirectUri) {
        return json(400, { error: `invalid_request (!code${code} || !clientId${clientId} || !redirectUri${redirectUri})` });
    }
    
    // Check if PKCE is required for this client
    const pkceRequired = isPkceRequired(clientId);
    if (pkceRequired && !verifier) {
        return json(400, { error: "invalid_request (PKCE required but no code_verifier provided)" });
    }
    
    log("token_request_parameters_present", clientId, { hasCode: !!code, hasRedirect: !!redirectUri, hasPkceVerifier: !!verifier, pkceRequired }, maskSensitive(code));

    // Validate client authentication (for public clients, no secret needed)
    const clientSecret = body.get("client_secret");
    if (!validateClientAuth(clientId, clientSecret)) {
      return json(401, { error: `invalid_client (!validateClientAuth(${clientId}, clientSecret))` });
    } else {
      log("client_authenticated", clientId);
    }

    const row = await get(tables.codes, { code });
    log("token_request_validation row for code", { codeExists: !!row.Item }, maskSensitive(code));
    if (!row.Item) {
        return json(400, { error: "invalid_grant (!row.Item)" });
    } else {
        log("authorization_code_found", { sub: row.Item?.sub, client: row.Item?.client }, maskSensitive(code));
    }

    const now = Math.floor(Date.now() / 1000);
    if (row.Item.used === true || (row.Item.ttl && row.Item.ttl <= now)) {
      return json(400, { error: `invalid_grant (row.Item.used === true || ${row.Item.ttl} <= now)` });
    } else {
        log("authorization_code_valid", { used: row.Item.used === true, ttl: row.Item.ttl, now });
    }

    if (row.Item.ccm && row.Item.ccm !== "S256") {
      return json(400, { error: `invalid_grant (${row.Item.ccm} !== "S256")` });
    }else {
      log("authorization_code_challenge_method", row.Item.ccm || "none");
    }

    // Validate that client_id and redirect_uri match what was stored in the auth code
    if (row.Item.client !== clientId) {
      log("token_validation_failed", "client_mismatch", `stored: ${row.Item.client}, provided: ${clientId}`);
      return json(400, { error: `invalid_grant (row.Item.client !== ${clientId})` });
    } else {
      log("token_client_id_validated", clientId, { clientValidated: true }, maskSensitive(code));
    }
    
    if (row.Item.redirect !== redirectUri) {
      log("token_validation_failed", "redirect_mismatch", `stored: ${row.Item.redirect}, provided: ${redirectUri}`);
      return json(400, { error: `invalid_grant (row.Item.redirect !== ${redirectUri})` });
    } else {
      log("token_redirect_uri_validated", redirectUri, { redirectValidated: true }, maskSensitive(code));
    }

    // Validate PKCE challenge if present in authorization code
    if (row.Item.ccm) {
        // If we have a challenge method, we must have a verifier
        if (!verifier) {
            return json(400, { error: "invalid_grant (PKCE challenge present but no code_verifier provided)" });
        }
        
        const expectedChallenge = crypto.createHash("sha256").update(verifier).digest("base64url");
        if (expectedChallenge !== row.Item.ch) {
            return json(400, { error: "invalid_grant (PKCE challenge verification failed)" });
        }
        log("pkce_verification_success", { challengeMethod: row.Item.ccm });
    } else {
        log("no_pkce_challenge_to_verify", { hasVerifier: !!verifier, hasChallenge: !!row.Item.ch });
    }

    // Use conditional delete to ensure one-time use
    log("token_request_validated", clientId, { codeValidated: true, sub: row.Item?.sub }, maskSensitive(code));
    try {
      await conditionalDelete(tables.codes, { code }, "attribute_exists(code)");
    } catch (error) {
      if (error.name === "ConditionalCheckFailedException") {
        log("authorization_code_already_used", maskSensitive(code));
        return json(400, { error: "invalid_grant" });
      } else {
        logError("authorization_code_delete_failed", error, { code: maskSensitive(code) });
      }
      throw error;
    }

    const iss = process.env.ISSUER;
    const aud = row.Item.client;
    const sub = row.Item.sub;
    const scope = row.Item.scope;

    // Build ID token claims
    const idTokenClaims = { 
      iss, 
      sub, 
      aud, 
      iat: now, 
      exp: now + 300, 
      nonce: row.Item.nonce 
    };

    // Add user claims if available and scope permits
    if (process.env.USERS_TABLE && tables.users) {
      log("looking_up_user_claims", sub);
      try {
        const userRecord = await get(tables.users, { username: sub });
        if (userRecord.Item) {
          const scopes = scope ? scope.split(" ") : [];
          
          // Include email claims if email scope was requested
          if (scopes.includes("email") && userRecord.Item.email) {
            idTokenClaims.email = userRecord.Item.email;
            idTokenClaims.email_verified = userRecord.Item.emailVerified || false;
          }
          
          // Include profile claims if profile scope was requested
          if (scopes.includes("profile")) {
            if (userRecord.Item.name) idTokenClaims.name = userRecord.Item.name;
            if (userRecord.Item.given_name) idTokenClaims.given_name = userRecord.Item.given_name;
            if (userRecord.Item.family_name) idTokenClaims.family_name = userRecord.Item.family_name;
          }
          
          log("user_claims_added", "scopes:", scopes.join(","));
        }
      } catch (dbError) {
        log("user_lookup_failed", dbError);
        // Continue without user claims if lookup fails
      }
    }

    const id_token = await signJwt(idTokenClaims);
    const access_token = await signJwt({ iss, sub, aud, iat: now, exp: now + 300, scope: row.Item.scope });

    log("token_issued", sub);
    return json(200, { id_token, access_token, token_type: "Bearer", expires_in: 300 });
  } catch (e) {
    logError("token_error", e);
    return json(500, { error: "server_error" });
  }
};

const json = (s, obj) => ({
  statusCode: s,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
  body: JSON.stringify(obj),
});
