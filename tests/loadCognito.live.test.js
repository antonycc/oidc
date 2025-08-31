/*
 * k6 load test script for the Cognito authentication flow in antonycc/oidc stack.
 *
 * This script tests the Cognito Hosted UI flow which differs from the direct OIDC flow:
 * 1. Simulates going to loginCognito.html page 
 * 2. Tests the Cognito Hosted UI redirection URL construction
 * 3. Simulates the Cognito callback to post-authCognito.html
 *
 * Note: This test focuses on the web UI components since the actual Cognito 
 * authentication happens external to our infrastructure.
 *
 * Environment variables:
 * - BASE_URL: Base URL of the OIDC service (e.g., https://oidc.antonycc.com)
 * - COGNITO_DOMAIN: Cognito domain (e.g., auth.oidc.antonycc.com)
 * - COGNITO_CLIENT_ID: Cognito client ID (required for full flow testing)
 *
 * Usage:
 * k6 run tests/loadCognito.live.test.js --env BASE_URL=https://oidc.antonycc.com --env COGNITO_DOMAIN=auth.oidc.antonycc.com --env COGNITO_CLIENT_ID=your-client-id
 */

import http from "k6/http";
import { check } from "k6";
import { sha256 } from "k6/crypto";
import encoding from "k6/encoding";

// Environment configuration
const BASE_URL = __ENV.BASE_URL || "https://oidc.antonycc.com";
const COGNITO_DOMAIN = __ENV.COGNITO_DOMAIN || `auth.${BASE_URL.replace('https://', '')}`;
const COGNITO_CLIENT_ID = __ENV.COGNITO_CLIENT_ID || "test-client-id";

// OAuth2/OIDC flow parameters
const SCOPE = "openid email profile";
const RESPONSE_TYPE = "code";
const CODE_CHALLENGE_METHOD = "S256";

/*
 * Helper to generate OAuth2 state parameter and PKCE challenge
 */
function generateOAuthParams() {
  // Generate state parameter (32 chars)
  let state = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  for (let i = 0; i < 32; i++) {
    state += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  // Generate nonce parameter (32 chars)
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  // Generate PKCE code verifier (64 chars)
  let code_verifier = "";
  for (let i = 0; i < 64; i++) {
    code_verifier += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  // Create PKCE code challenge
  const challengeBytes = sha256(code_verifier, "binary");
  const code_challenge = encoding.b64encode(challengeBytes, "rawurl");

  return {
    state,
    nonce,
    code_verifier,
    code_challenge,
  };
}

/*
 * Load test configuration
 */
export let options = {
  stages: [
    { duration: "30s", target: 5 },   // Ramp up to 5 VUs over 30s
    { duration: "1m", target: 10 },   // Stay at 10 VUs for 1 minute
    { duration: "30s", target: 0 },   // Ramp down to 0 VUs over 30s
  ],
  thresholds: {
    http_req_duration: ["p(95)<2000"], // 95% of requests must complete within 2s
    http_req_failed: ["rate<0.1"],     // Less than 10% of requests can fail
  },
};

/*
 * Main test scenario - Cognito authentication flow UI testing
 */
export default function () {
  // Test 1: Load home page and check for Cognito login option
  console.log(`Testing home page at ${BASE_URL}`);
  let homeResponse = http.get(`${BASE_URL}/`);
  check(homeResponse, {
    "home page status is 200": (r) => r.status === 200,
    "home page contains Cognito login link": (r) => r.body.includes("loginCognito.html"),
    "home page contains Cognito login text": (r) => r.body.includes("Login with Cognito"),
  });

  // Test 2: Load Cognito login page
  console.log(`Testing Cognito login page at ${BASE_URL}/loginCognito.html`);
  
  // Test with client_id parameter to simulate proper configuration
  let cognitoLoginUrl = `${BASE_URL}/loginCognito.html?client_id=${COGNITO_CLIENT_ID}`;
  let loginResponse = http.get(cognitoLoginUrl);
  check(loginResponse, {
    "cognito login page status is 200": (r) => r.status === 200,
    "cognito login page contains title": (r) => r.body.includes("OIDC - Cognito Login"),
    "cognito login page contains redirect text": (r) => r.body.includes("You will be redirected to AWS Cognito"),
    "cognito login page contains JavaScript": (r) => r.body.includes("initiateCognitoLogin"),
  });

  // Test 3: Simulate Cognito callback to post-authCognito.html
  console.log(`Testing Cognito post-auth page with simulated callback`);
  
  // Generate OAuth parameters for testing
  const oauthParams = generateOAuthParams();
  
  // Test successful auth code scenario
  let successUrl = `${BASE_URL}/post-authCognito.html?code=test-auth-code-${Date.now()}&state=${oauthParams.state}`;
  let successResponse = http.get(successUrl);
  check(successResponse, {
    "post-auth success page status is 200": (r) => r.status === 200,
    "post-auth success page contains title": (r) => r.body.includes("OIDC - Cognito Post-auth"),
    "post-auth success page contains JavaScript": (r) => r.body.includes("exchangeCognitoCode"),
  });

  // Test 4: Test error handling in post-authCognito.html
  console.log(`Testing Cognito post-auth error handling`);
  
  let errorUrl = `${BASE_URL}/post-authCognito.html?error=access_denied&error_description=User%20cancelled%20authentication`;
  let errorResponse = http.get(errorUrl);
  check(errorResponse, {
    "post-auth error page status is 200": (r) => r.status === 200,
    "post-auth error page contains error handling": (r) => r.body.includes("Authentication error"),
  });

  // Test 5: Test post-authCognito.html without parameters (graceful handling)
  console.log(`Testing Cognito post-auth page without parameters`);
  
  let noParamsUrl = `${BASE_URL}/post-authCognito.html`;
  let noParamsResponse = http.get(noParamsUrl);
  check(noParamsResponse, {
    "post-auth no params page status is 200": (r) => r.status === 200,
    "post-auth no params page contains fallback": (r) => r.body.includes("Try Cognito login again"),
  });

  // Test 6: Verify static assets load correctly
  console.log(`Testing static assets`);
  
  let cssResponse = http.get(`${BASE_URL}/oidc.css`);
  check(cssResponse, {
    "CSS file loads": (r) => r.status === 200,
    "CSS content type": (r) => r.headers["Content-Type"] && r.headers["Content-Type"].includes("text/css"),
  });

  let jsResponse = http.get(`${BASE_URL}/oidc.js`);
  check(jsResponse, {
    "JS file loads": (r) => r.status === 200,
    "JS contains auth functions": (r) => r.body.includes("checkLoginStatus"),
  });

  // Brief pause between iterations
  sleep(1);
}

/*
 * Performance test setup verification
 */
export function setup() {
  console.log(`Starting Cognito load test for ${BASE_URL}`);
  console.log(`Cognito domain: ${COGNITO_DOMAIN}`);
  console.log(`Client ID: ${COGNITO_CLIENT_ID}`);
  
  // Verify the service is available
  let healthCheck = http.get(BASE_URL);
  if (healthCheck.status !== 200) {
    throw new Error(`Service not available at ${BASE_URL} - status: ${healthCheck.status}`);
  }
  
  console.log("Service health check passed");
  return { baseUrl: BASE_URL };
}

/*
 * Cleanup after test completion
 */
export function teardown(data) {
  console.log(`Cognito load test completed for ${data.baseUrl}`);
}

// Add sleep function import
import { sleep } from "k6";