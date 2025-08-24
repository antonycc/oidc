const log = (...a) => console.log(JSON.stringify({ level: "info", ts: new Date().toISOString(), msg: a.join(" ") }));

// Simple in-memory access token to user mapping for demonstration
const accessTokenToUser = {
  "valid-token-1": { sub: "user1", email: "user1@example.com", email_verified: true, name: "User One" },
  "valid-token-2": { sub: "user2", email: "user2@example.com", email_verified: false, name: "User Two" },
};

// Handler expects an event object with headers
export const handler = async (event) => {
  log("userinfo");
  const authHeader = event?.headers?.authorization || event?.headers?.Authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      statusCode: 401,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
      body: JSON.stringify({ error: "invalid_request", error_description: "Missing or invalid Authorization header" }),
    };
  }
  const accessToken = authHeader.slice("Bearer ".length);
  const user = accessTokenToUser[accessToken];
  if (!user) {
    return {
      statusCode: 401,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
      body: JSON.stringify({ error: "invalid_token", error_description: "Access token is invalid or expired" }),
    };
  }
  return {
    statusCode: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
    body: JSON.stringify(user),
  };
};
