/*
 * k6 load‑test script for the antonycc/oidc stack.
 *
 * This script defines four scenarios that approximate the requested
 * performance tests:
 *  - small  (5 000 users in 1 min, ramping 100/10s → 1 000/10s)
 *  - medium (10 000 users in 2 min, same ramp pattern)
 *  - large  (100 000 users in 5 min, ramping 100/10s → 1 000/10s → 1 000/1s)
 *  - xlarge (1 000 000 users in 10 min, same ramp pattern as large)
 *
 * For each scenario we convert the “ramp up” specification into a set
 * of `ramping‑arrival‑rate` stages.  Each stage defines how many
 * iterations (authorization flows) per second to inject and for how
 * long.  The final stage calculates the required steady rate to
 * consume all remaining users over the remaining test duration.  The
 * resulting rates are approximations but preserve the overall shape
 * (slow ramp → spike → steady high throughput).
 *
 * To run a specific scenario locally:
 *   k6 run load-tests.js --scenario medium --env TARGET_URL=https://oidc.antonycc.com
 *
 * The script uses the PKCE (S256) flow implemented by the service.
 * It generates a random code verifier and computes the code
 * challenge on the client.  Each iteration performs two HTTP
 * requests: one to `/authorize` and one to `/token`.  You can
 * override client identifiers and credentials via environment
 * variables (see below).
 */

import http from 'k6/http';
import { check } from 'k6';
import { sha256 } from 'k6/crypto';
import encoding from 'k6/encoding';

/*
 * Environment configuration
 *
 * TARGET_URL   – base URL of the deployed OIDC service (defaults to
 *                https://oidc.antonycc.com)
 * CLIENT_ID    – client identifier registered with the OIDC service
 *                (defaults to "demo-client")
 * REDIRECT_URI – redirect URI to use in the authorization code flow
 *                (defaults to "https://example.com/callback")
 * PASSWORD     – password to send with the username in the authorize
 *                request (defaults to "password")
 * USERNAME_PREFIX – prefix for generated usernames (defaults to
 *                "user")
 */
const TARGET_URL = __ENV.TARGET_URL || 'https://oidc.antonycc.com';
const CLIENT_ID = __ENV.CLIENT_ID || 'demo-client';
const REDIRECT_URI = __ENV.REDIRECT_URI || 'https://example.com/callback';
const PASSWORD = __ENV.PASSWORD || 'password';
const USERNAME_PREFIX = __ENV.USERNAME_PREFIX || 'user';

/*
 * Helper to generate a PKCE code verifier and corresponding
 * challenge using SHA‑256.  A code verifier must be between 43 and
 * 128 characters; here we generate a 64‑character random string
 * comprised of URL‑safe characters.  The code challenge is the
 * base64url‑encoded SHA‑256 digest of the verifier.
 */
function generatePkce() {
  // Generate a pseudo‑random verifier.  Math.random() is used here
  // because cryptographically secure randomness is unnecessary for load
  // testing.  Each verifier is unique per iteration.
  let verifier = '';
  while (verifier.length < 64) {
    verifier += Math.random().toString(36).substring(2);
  }
  verifier = verifier.substring(0, 64);
  const hash = sha256(verifier, 'binary');
  const challenge = encoding.b64encode(hash, 'url');
  return { verifier, challenge };
}

/*
 * Shared request function executed by all scenarios.  Each iteration
 * performs the OIDC authorization code flow:
 *   1. Generate a unique username and PKCE verifier/challenge.
 *   2. Call the `/authorize` endpoint with the appropriate query
 *      parameters.  Expect a 302 redirect with the `code` in the
 *      Location header.
 *   3. Parse the authorization code from the Location header.
 *   4. Call the `/token` endpoint with a POST to exchange the code.
 */
export function testFlow() {
  // Unique identity per virtual user and iteration
  const timestamp = Date.now();
  const username = `${USERNAME_PREFIX}-${__VU}-${timestamp}`;

  // PKCE generation
  const { verifier: codeVerifier, challenge: codeChallenge } = generatePkce();

  // Build the /authorize URL
  const authorizeURL = `${TARGET_URL}/authorize` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&scope=openid` +
    `&state=state-${timestamp}` +
    `&code_challenge=${encodeURIComponent(codeChallenge)}` +
    `&code_challenge_method=S256` +
    `&username=${encodeURIComponent(username)}` +
    `&password=${encodeURIComponent(PASSWORD)}`;

  // Initiate the authorization request
  const authRes = http.get(authorizeURL, { redirects: 0 });
  // Extract the code from the Location header.  If no Location
  // header is present, fall back to parsing the body (unlikely).
  const location = authRes.headers.Location || authRes.headers.location;
  let code = '';
  if (location && location.includes('code=')) {
    const idx = location.indexOf('code=') + 5;
    code = location.substring(idx).split('&')[0];
  } else if (authRes.status === 200 && authRes.body.includes('code=')) {
    // Rarely the server may return the code in the body for errors.
    const match = authRes.body.match(/code=([A-Za-z0-9_-]+)/);
    if (match) code = match[1];
  }

  // Exchange the code for tokens
  const tokenPayload = `grant_type=authorization_code` +
    `&code=${encodeURIComponent(code)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&code_verifier=${encodeURIComponent(codeVerifier)}`;
  const tokenRes = http.post(`${TARGET_URL}/token`, tokenPayload, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    redirects: 0,
  });
  // Validate token response status
  check(tokenRes, {
    'token status is 200': (r) => r.status === 200,
  });
}

/*
 * Define scenarios for each performance test.  The ramping‑arrival‑rate
 * executor lets us specify how many iterations (authentication
 * flows) should start per second.  Each stage in a scenario
 * approximates the requested ramp pattern and adjusts the rate so
 * that the total number of iterations matches the target user count.
 */
export const options = {
  scenarios: {
    // 5,000 users over 1 minute: ramp 100 users in 10s (10 rps),
    // then 1,000 users in 10s (100 rps), then hold at ~97.5 rps for
    // the remaining 40 seconds to reach ~5 000 total.
    small: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1s',
      preAllocatedVUs: 200,
      maxVUs: 1000,
      exec: 'testFlow',
      stages: [
        { target: 10, duration: '10s' },
        { target: 100, duration: '10s' },
        { target: 98, duration: '40s' },
      ],
    },
    // 10,000 users over 2 minutes: same ramps as above but with a
    // longer steady phase at ~89 rps for 100 seconds.
    medium: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1s',
      preAllocatedVUs: 400,
      maxVUs: 2000,
      exec: 'testFlow',
      stages: [
        { target: 10, duration: '10s' },
        { target: 100, duration: '10s' },
        { target: 89, duration: '100s' },
      ],
    },
    // 100,000 users over 5 minutes: ramp 100 (10 rps) for 10s,
    // 1 000 (100 rps) for 10s, spike 1 000 (1 000 rps) for 1s,
    // then hold at ~351 rps for the remaining 279 seconds.
    large: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1s',
      preAllocatedVUs: 2000,
      maxVUs: 6000,
      exec: 'testFlow',
      stages: [
        { target: 10, duration: '10s' },
        { target: 100, duration: '10s' },
        { target: 1000, duration: '1s' },
        { target: 351, duration: '279s' },
      ],
    },
    // 1,000,000 users over 10 minutes: identical ramps as the 100k
    // test but with a long steady phase of ~1 724 rps for 579 seconds.
    xlarge: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1s',
      preAllocatedVUs: 5000,
      maxVUs: 10000,
      exec: 'testFlow',
      stages: [
        { target: 10, duration: '10s' },
        { target: 100, duration: '10s' },
        { target: 1000, duration: '1s' },
        { target: 1724, duration: '579s' },
      ],
    },
  },
};