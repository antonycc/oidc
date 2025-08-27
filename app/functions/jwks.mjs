import { publicJwks } from "../lib/crypto.mjs";

const log = (...a) => console.log(JSON.stringify({ level: "info", ts: new Date().toISOString(), msg: a.join(" ") }));

export const handler = async (event) => {
  try {
    log("jwks_request");
    
    // Get the current public keys
    const jwks = await publicJwks();
    
    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=3600", // Cache for 1 hour since keys are stable
      },
      body: JSON.stringify(jwks),
    };
  } catch (e) {
    console.error("jwks_error", e);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
      body: JSON.stringify({ error: "server_error" }),
    };
  }
};