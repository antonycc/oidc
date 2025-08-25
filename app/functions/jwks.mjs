import { publicJwks, ensureKeys } from "../lib/crypto.mjs";

const log = (...a) => console.log(JSON.stringify({ level: "info", ts: new Date().toISOString(), msg: a.join(" ") }));

export const handler = async () => {
  try {
    await ensureKeys();
    const body = JSON.stringify(publicJwks());
    log("jwks");
    return {
      statusCode: 200,
      headers: { "content-type": "application/json", "cache-control": "public, max-age=60" },
      body,
    };
  } catch (e) {
    console.error("jwks_error", e);
    return { statusCode: 500, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: "server_error" }) };
  }
};
