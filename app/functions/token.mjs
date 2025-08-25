import crypto from "node:crypto";
import { get, conditionalDelete, put, tables } from "../lib/db.mjs";
import { signJwt } from "../lib/crypto.mjs";
import { validateClientAuth } from "../lib/clients.mjs";
const log = (...a) => console.log(JSON.stringify({ level: "info", ts: new Date().toISOString(), msg: a.join(" ") }));

export const handler = async (event) => {
  try {
    if (event.requestContext.http.method !== "POST") return json(405, { error: "method_not_allowed" });

    const body = new URLSearchParams(event.body || "");
    const grant = body.get("grant_type");
    if (grant !== "authorization_code") return json(400, { error: "unsupported_grant_type" });

    const code = body.get("code");
    const verifier = body.get("code_verifier") || "";
    const clientId = body.get("client_id");
    const redirectUri = body.get("redirect_uri");
    
    if (!code || !verifier || !clientId || !redirectUri) return json(400, { error: "invalid_request" });

    // Validate client authentication (for public clients, no secret needed)
    const clientSecret = body.get("client_secret");
    if (!validateClientAuth(clientId, clientSecret)) {
      return json(401, { error: "invalid_client" });
    }

    const row = await get(tables.codes, { code });
    if (!row.Item) return json(400, { error: "invalid_grant" });

    // Validate that client_id and redirect_uri match what was stored in the auth code
    if (row.Item.client !== clientId) {
      log("token_validation_failed", "client_mismatch", `stored: ${row.Item.client}, provided: ${clientId}`);
      return json(400, { error: "invalid_grant" });
    }
    
    if (row.Item.redirect !== redirectUri) {
      log("token_validation_failed", "redirect_mismatch", `stored: ${row.Item.redirect}, provided: ${redirectUri}`);
      return json(400, { error: "invalid_grant" });
    }

    const expect = crypto.createHash("sha256").update(verifier).digest("base64url");
    if (expect !== row.Item.ch) return json(400, { error: "invalid_grant" });

    // Use conditional delete to ensure one-time use
    try {
      await conditionalDelete(tables.codes, { code }, "attribute_exists(code)");
    } catch (error) {
      if (error.name === "ConditionalCheckFailedException") {
        log("authorization_code_already_used", code);
        return json(400, { error: "invalid_grant" });
      }
      throw error;
    }

    const now = Math.floor(Date.now() / 1000);
    const iss = process.env.ISSUER;
    const aud = row.Item.client;
    const sub = row.Item.sub;

    const id_token = await signJwt({ iss, sub, aud, iat: now, exp: now + 300, nonce: row.Item.nonce });
    const access_token = await signJwt({ iss, sub, aud, iat: now, exp: now + 300, scope: row.Item.scope });

    const rt = crypto.randomBytes(32).toString("base64url");
    await put(tables.refresh, { rt, sub, ttl: now + 86400 });

    log("token_issued", sub);
    return json(200, { id_token, access_token, token_type: "Bearer", expires_in: 300, refresh_token: rt });
  } catch (e) {
    console.error("token_error", e);
    return json(500, { error: "server_error" });
  }
};

const json = (s, obj) => ({
  statusCode: s,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
  body: JSON.stringify(obj),
});
