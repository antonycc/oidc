/*
 * k6 load test script for the antonycc/oidc stack.
 *
 * This script replicates the exact same OIDC flow as tests/api.live.test.ts:
 * 1. POST /authorize with username/password + PKCE to obtain code via redirect
 * 2. POST /token with code+verifier to obtain tokens
 * 3. GET /userinfo with access token to obtain claims
 *
 * The script uses the same parameters as the Playwright API tests to ensure
 * consistency between functional tests and load tests.
 *
 * Environment variables:
 * - BASE_URL: Base URL of the OIDC service (e.g., https://oidc.antonycc.com)
 * - TEST_USERNAME: Username for authentication (default: test-user)
 * - TEST_PASSWORD: Password for authentication (required)
 *
 * Usage:
 * k6 run tests/load.live.test.ts --env BASE_URL=https://oidc.antonycc.com --env TEST_USERNAME=test-user --env TEST_PASSWORD=your-password
 */

import http from "k6/http";
import { check } from "k6";
import { sha256 } from "k6/crypto";
import encoding from "k6/encoding";

// Environment configuration matching api.live.test.ts
const BASE_URL = __ENV.BASE_URL || "https://oidc.antonycc.com";
const TEST_USERNAME = __ENV.TEST_USERNAME || "test-user";
const TEST_PASSWORD = __ENV.TEST_PASSWORD || "";

// OIDC flow parameters matching api.live.test.ts
const CLIENT_ID = "self-client";
const SCOPE = "openid email profile";
const RESPONSE_TYPE = "code";
const CODE_CHALLENGE_METHOD = "S256";

/*
 * Helper to generate a PKCE code verifier and corresponding
 * challenge using SHA-256, matching the implementation in api.live.test.ts
 */
function generatePkce() {
  // Generate a URL-safe random string for PKCE verifier (43-128 chars)
  let verifier = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  for (let i = 0; i < 64; i++) {
    verifier += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  // Create code challenge as base64url-encoded SHA256 hash
  const hash = sha256(verifier, "binary");
  const challenge = encoding.b64encode(hash, "url");
  
  return { verifier, challenge };
}

/*
 * Generate a random string for state and nonce parameters
 */
function randomString(length = 32) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/*
 * Parse a URL parameter from a URL string
 */
function parseParam(url, name) {
  try {
    const urlObj = new URL(url);
    return urlObj.searchParams.get(name);
  } catch {
    return null;
  }
}

/*
 * Main test function that performs the complete OIDC flow
 * This matches the flow in tests/api.live.test.ts exactly
 */
export default function() {
  if (!TEST_PASSWORD) {
    throw new Error("TEST_PASSWORD environment variable is required");
  }

  const redirect_uri = `${BASE_URL}/post-auth.html`;
  const state = randomString(32);
  const nonce = randomString(16);
  const { verifier: code_verifier, challenge: code_challenge } = generatePkce();

  // Step 1: Build authorize URL with query parameters
  const authorizeUrl = `${BASE_URL}/authorize` +
    `?response_type=${encodeURIComponent(RESPONSE_TYPE)}` +
    `&client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(redirect_uri)}` +
    `&scope=${encodeURIComponent(SCOPE)}` +
    `&state=${encodeURIComponent(state)}` +
    `&nonce=${encodeURIComponent(nonce)}` +
    `&code_challenge=${encodeURIComponent(code_challenge)}` +
    `&code_challenge_method=${CODE_CHALLENGE_METHOD}` +
    `&username=${encodeURIComponent(TEST_USERNAME)}` +
    `&password=${encodeURIComponent(TEST_PASSWORD)}`;

  // Step 1: POST to /authorize to get authorization code
  const authorizeBody = `username=${encodeURIComponent(TEST_USERNAME)}&password=${encodeURIComponent(TEST_PASSWORD)}`;
  const authorizeRes = http.post(authorizeUrl, authorizeBody, {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    redirects: 0, // Don't follow redirects automatically
  });

  // Check authorize response (should be 302 redirect or 200 with code)
  const authorizeOk = check(authorizeRes, {
    "authorize status is 200 or 302": (r) => [200, 302].includes(r.status),
    "authorize response has code": (r) => {
      const location = r.headers["Location"] || r.url;
      return location && location.includes("code=");
    },
  });

  if (!authorizeOk) {
    console.error(`Authorize failed: ${authorizeRes.status} ${authorizeRes.body}`);
    return;
  }

  // Extract authorization code from Location header or final URL
  const location = authorizeRes.headers["Location"] || authorizeRes.url;
  const code = parseParam(location, "code");
  const returnedState = parseParam(location, "state");

  if (!code) {
    console.error(`No authorization code found in: ${location}`);
    return;
  }

  if (returnedState !== state) {
    console.error(`State mismatch: expected ${state}, got ${returnedState}`);
    return;
  }

  // Step 2: Exchange authorization code for tokens
  const tokenUrl = `${BASE_URL}/token`;
  const tokenBody = [
    `grant_type=authorization_code`,
    `code=${encodeURIComponent(code)}`,
    `redirect_uri=${encodeURIComponent(redirect_uri)}`,
    `client_id=${encodeURIComponent(CLIENT_ID)}`,
    `code_verifier=${encodeURIComponent(code_verifier)}`
  ].join("&");

  const tokenRes = http.post(tokenUrl, tokenBody, {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  const tokenOk = check(tokenRes, {
    "token status is 200": (r) => r.status === 200,
    "token response is JSON": (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch {
        return false;
      }
    },
  });

  if (!tokenOk) {
    console.error(`Token exchange failed: ${tokenRes.status} ${tokenRes.body}`);
    return;
  }

  let tokenData;
  try {
    tokenData = JSON.parse(tokenRes.body);
  } catch {
    console.error(`Token response not JSON: ${tokenRes.body}`);
    return;
  }

  const tokenValidation = check(tokenData, {
    "token response has access_token": (data) => data.access_token,
    "token response has id_token": (data) => data.id_token,
  });

  if (!tokenValidation) {
    console.error(`Token response missing required fields: ${tokenRes.body}`);
    return;
  }

  // Step 3: Get user info using access token
  const userinfoUrl = `${BASE_URL}/userinfo`;
  let userinfoRes = http.get(userinfoUrl, {
    headers: {
      "Authorization": `Bearer ${tokenData.access_token}`,
    },
  });

  // If access token fails, try id_token as fallback (matching api.live.test.ts behavior)
  if (userinfoRes.status === 401 && tokenData.id_token) {
    userinfoRes = http.get(userinfoUrl, {
      headers: {
        "Authorization": `Bearer ${tokenData.id_token}`,
      },
    });
  }

  const userinfoOk = check(userinfoRes, {
    "userinfo status is 200": (r) => r.status === 200,
    "userinfo response is JSON": (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch {
        return false;
      }
    },
  });

  if (userinfoOk) {
    try {
      const claims = JSON.parse(userinfoRes.body);
      check(claims, {
        "userinfo has sub claim": (data) => data.sub,
      });
    } catch {
      console.error(`Userinfo response not JSON: ${userinfoRes.body}`);
    }
  } else if (userinfoRes.status !== 200) {
    // Final fallback: decode id_token locally (matching api.live.test.ts)
    try {
      const parts = tokenData.id_token.split(".");
      const payload = JSON.parse(encoding.b64decode(parts[1], "std", "s"));
      check(payload, {
        "id_token has sub claim": (data) => data.sub,
      });
    } catch {
      console.error(`Userinfo failed and id_token decode failed: ${userinfoRes.status} ${userinfoRes.body}`);
    }
  }
}

/*
 * Load test scenarios matching the original k6 configuration
 * but running for 5 minutes total as requested
 */
export const options = {
  scenarios: {
    // 5-minute load test with moderate load
    load_test: {
      executor: "ramping-arrival-rate",
      startRate: 1,
      timeUnit: "1s",
      preAllocatedVUs: 10,
      maxVUs: 50,
      stages: [
        { duration: "1m", target: 5 },   // Ramp up to 5 RPS
        { duration: "2m", target: 10 },  // Increase to 10 RPS  
        { duration: "1m", target: 10 },  // Hold at 10 RPS
        { duration: "1m", target: 0 },   // Ramp down
      ],
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<2000"], // 95% of requests should be below 2s
    http_req_failed: ["rate<0.1"],     // Error rate should be below 10%
  },
};