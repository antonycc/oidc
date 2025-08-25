import crypto from "node:crypto";
import { get, update, tables } from "../lib/db.mjs";
import { signJwt } from "../lib/crypto.mjs";
const log = (...a) => console.log(JSON.stringify({ level: "info", ts: new Date().toISOString(), msg: a.join(" ") }));

export const handler = async (event) => {
  try {
    if (event.requestContext.http.method !== "POST") return json(405, { error: "method_not_allowed" });

    const body = new URLSearchParams(event.body || "");
    const grant = body.get("grant_type");
    if (grant !== "authorization_code") return json(400, { error: "unsupported_grant_type" });

    const code = body.get("code");
    const verifier = body.get("code_verifier") || "";
    const client_id = body.get("client_id");
    const redirect_uri = body.get("redirect_uri");
    if (!code || !verifier || !client_id || !redirect_uri) return json(400, { error: "invalid_request" });

    const row = await get(tables.codes, { code });
    if (!row.Item) return json(400, { error: "invalid_grant" });

    const now = Math.floor(Date.now() / 1000);
    if (row.Item.used === true || (row.Item.ttl && row.Item.ttl <= now)) return json(400, { error: "invalid_grant" });
    if (row.Item.client !== client_id || row.Item.redirect !== redirect_uri) return json(400, { error: "invalid_grant" });
    if (row.Item.ccm && row.Item.ccm !== "S256") return json(400, { error: "invalid_grant" });

    const expect = crypto.createHash("sha256").update(verifier).digest("base64url");
    if (expect !== row.Item.ch) return json(400, { error: "invalid_grant" });

    // Atomic one-time use: set used=true if not already used and not expired, and client/redirect match
    try {
      await update(tables.codes, {
        Key: { code },
        UpdateExpression: "SET used = :t",
        ConditionExpression:
          "attribute_exists(code) AND (attribute_not_exists(used) OR used = :f) AND ttl > :now AND client = :c AND redirect = :r",
        ExpressionAttributeValues: { ":t": true, ":f": false, ":now": now, ":c": client_id, ":r": redirect_uri },
      });
    } catch (err) {
      log("code_update_conflict", String(err?.name || err));
      return json(400, { error: "invalid_grant" });
    }

    const iss = process.env.ISSUER;
    const aud = row.Item.client;
    const sub = row.Item.sub;

    const id_token = await signJwt({ iss, sub, aud, iat: now, exp: now + 300, nonce: row.Item.nonce });
    const access_token = await signJwt({ iss, sub, aud, iat: now, exp: now + 300, scope: row.Item.scope });

    log("token_issued", sub);
    return json(200, { id_token, access_token, token_type: "Bearer", expires_in: 300 });
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
