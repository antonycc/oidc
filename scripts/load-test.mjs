#!/usr/bin/env node

import { request } from "@playwright/test";
import * as crypto from "node:crypto";
import * as dotenv from "dotenv";

dotenv.config();

// Copy the utility functions from api.live.test.ts
function base64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function randomString(length = 64) {
  const bytes = crypto.randomBytes(Math.ceil((length * 3) / 4));
  return base64url(bytes).slice(0, length);
}

function buildPkce() {
  const code_verifier = randomString(64);
  const hash = crypto.createHash("sha256").update(code_verifier).digest();
  const code_challenge = base64url(hash);
  return { code_verifier, code_challenge, code_challenge_method: "S256" };
}

function parseParam(url, name) {
  try {
    const u = new URL(url);
    return u.searchParams.get(name);
  } catch {
    return null;
  }
}

// Test configuration - small numbers for testing
const SCENARIOS = {
  test: { targetUsers: 3, durationMs: 10000, maxConcurrency: 2 },
  small: { targetUsers: 5000, durationMs: 60000, maxConcurrency: 50 },
  medium: { targetUsers: 10000, durationMs: 120000, maxConcurrency: 100 },
  large: { targetUsers: 100000, durationMs: 300000, maxConcurrency: 500 },
  xlarge: { targetUsers: 1000000, durationMs: 600000, maxConcurrency: 1000 }
};

// Test metrics
let stats = {
  total: 0,
  success: 0,
  failed: 0,
  errors: [],
  durations: [],
  startTime: Date.now()
};

// Single test execution (extracted from api.live.test.ts)
async function runSingleTest() {
  const startTime = Date.now();
  
  try {
    const DOMAIN_NAME = process.env.DOMAIN_NAME || "oidc.antonycc.com";
    const BASE_URL = process.env.BASE_URL || `https://${DOMAIN_NAME}`;
    const TEST_USERNAME = process.env.TEST_USERNAME || "test-user";
    const TEST_PASSWORD = process.env.TEST_PASSWORD;

    if (!TEST_PASSWORD) {
      throw new Error("TEST_PASSWORD must be provided via environment");
    }

    const redirect_uri = new URL("/post-auth.html", BASE_URL).toString();
    const state = randomString(32);
    const scope = "openid email profile";
    const client_id = "self-client";
    const { code_verifier, code_challenge, code_challenge_method } = buildPkce();

    const ctx = await request.newContext({ baseURL: BASE_URL });

    // Build authorize URL
    const authorizeUrl = new URL("/authorize", BASE_URL);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", client_id);
    authorizeUrl.searchParams.set("redirect_uri", redirect_uri);
    authorizeUrl.searchParams.set("scope", scope);
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("nonce", randomString(16));
    authorizeUrl.searchParams.set("code_challenge", code_challenge);
    authorizeUrl.searchParams.set("code_challenge_method", code_challenge_method);
    authorizeUrl.searchParams.set("username", TEST_USERNAME);
    authorizeUrl.searchParams.set("password", TEST_PASSWORD);

    // Step 1: authorize
    const body = new URLSearchParams({ username: TEST_USERNAME, password: TEST_PASSWORD }).toString();
    const authorizeRes = await ctx.fetch(authorizeUrl.toString(), {
      method: "POST",
      headers: {"content-type": "application/x-www-form-urlencoded"},
      data: body,
    });

    const authorizeResStatus = authorizeRes.status();
    if (![200, 302].includes(authorizeResStatus)) {
      throw new Error(`Authorize failed with status ${authorizeResStatus}`);
    }

    const location = authorizeRes.headers()["location"];
    const finalUrl = location || authorizeRes.url();
    const code = parseParam(finalUrl, "code");
    
    if (!code) {
      throw new Error("No authorization code received");
    }

    // Step 2: token exchange
    const tokenRes = await ctx.fetch("/token", {
      method: "POST",
      form: {
        grant_type: "authorization_code",
        code: code,
        redirect_uri,
        client_id,
        code_verifier,
      },
    });

    if (tokenRes.status() !== 200) {
      throw new Error(`Token exchange failed with status ${tokenRes.status()}`);
    }

    const tokenJson = await tokenRes.json();
    if (!tokenJson.access_token) {
      throw new Error("No access token received");
    }

    // Step 3: userinfo
    const userinfoRes = await ctx.fetch("/userinfo", {
      method: "GET",
      headers: { authorization: `Bearer ${tokenJson.access_token}` },
    });

    if (userinfoRes.status() !== 200) {
      // Try with id_token as fallback
      const altRes = await ctx.fetch("/userinfo", {
        method: "GET",
        headers: { authorization: `Bearer ${tokenJson.id_token}` },
      });
      
      if (altRes.status() !== 200) {
        throw new Error(`Userinfo failed with both access and id tokens`);
      }
    }

    await ctx.dispose();
    
    const duration = Date.now() - startTime;
    stats.total++;
    stats.success++;
    stats.durations.push(duration);
    
    return { success: true, duration };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    stats.total++;
    stats.failed++;
    stats.errors.push(error.message);
    
    return { success: false, duration, error: error.message };
  }
}

// Main load test runner
async function runLoadTest(scenario) {
  const config = SCENARIOS[scenario];
  if (!config) {
    throw new Error(`Unknown scenario: ${scenario}. Available: ${Object.keys(SCENARIOS).join(', ')}`);
  }

  console.log(`Starting load test scenario: ${scenario}`);
  console.log(`Target users: ${config.targetUsers}, Duration: ${config.durationMs}ms, Max concurrency: ${config.maxConcurrency}`);

  stats.startTime = Date.now();
  const endTime = stats.startTime + config.durationMs;
  let activeRequests = 0;
  let totalStarted = 0;

  // Rate calculation to reach target users within duration
  const targetRatePerMs = config.targetUsers / config.durationMs;

  const promises = [];

  while (Date.now() < endTime && totalStarted < config.targetUsers) {
    // Control concurrency
    if (activeRequests < config.maxConcurrency) {
      activeRequests++;
      totalStarted++;
      
      const promise = runSingleTest().finally(() => {
        activeRequests--;
      });
      promises.push(promise);

      // Rate limiting - wait if we're going too fast
      const elapsed = Date.now() - stats.startTime;
      const expectedCount = Math.floor(elapsed * targetRatePerMs);
      if (totalStarted > expectedCount) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    } else {
      // Wait a bit if at max concurrency
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Log progress
    if (totalStarted % Math.max(1, Math.floor(config.targetUsers / 10)) === 0) {
      const elapsed = Date.now() - stats.startTime;
      const rate = stats.total > 0 ? (stats.total / elapsed * 1000).toFixed(2) : 0;
      console.log(`Progress: ${totalStarted}/${config.targetUsers} started, ${stats.total} completed, ${rate} req/s`);
    }
  }

  // Wait for all requests to complete
  console.log('Waiting for all requests to complete...');
  await Promise.all(promises);

  // Generate final report
  const totalDuration = Date.now() - stats.startTime;
  const avgDuration = stats.durations.length > 0 ? stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length : 0;
  const sortedDurations = stats.durations.sort((a, b) => a - b);
  const p95Duration = sortedDurations.length > 0 ? sortedDurations[Math.floor(sortedDurations.length * 0.95)] : 0;
  const p99Duration = sortedDurations.length > 0 ? sortedDurations[Math.floor(sortedDurations.length * 0.99)] : 0;
  const successRate = stats.total > 0 ? (stats.success / stats.total * 100).toFixed(2) : 0;
  const avgRate = (stats.total / totalDuration * 1000).toFixed(2);

  const report = {
    scenario,
    config,
    stats: {
      ...stats,
      totalDuration,
      avgDuration: Math.round(avgDuration),
      p95Duration: Math.round(p95Duration),
      p99Duration: Math.round(p99Duration),
      successRate: parseFloat(successRate),
      avgRate: parseFloat(avgRate)
    }
  };

  console.log('\n=== Load Test Results ===');
  console.log(`Scenario: ${scenario}`);
  console.log(`Total requests: ${stats.total}`);
  console.log(`Successful: ${stats.success}`);
  console.log(`Failed: ${stats.failed}`);
  console.log(`Success rate: ${successRate}%`);
  console.log(`Average duration: ${Math.round(avgDuration)}ms`);
  console.log(`95th percentile: ${Math.round(p95Duration)}ms`);
  console.log(`99th percentile: ${Math.round(p99Duration)}ms`);
  console.log(`Average rate: ${avgRate} req/s`);
  console.log(`Total duration: ${totalDuration}ms`);

  if (stats.errors.length > 0) {
    console.log('\n=== Errors ===');
    const errorCounts = {};
    stats.errors.forEach(error => {
      errorCounts[error] = (errorCounts[error] || 0) + 1;
    });
    Object.entries(errorCounts).forEach(([error, count]) => {
      console.log(`${count}x: ${error}`);
    });
  }

  // Save detailed results to file
  await import('fs').then(fs => {
    fs.writeFileSync('load-test-results.json', JSON.stringify(report, null, 2));
  });

  return report;
}

// CLI entry point
const scenario = process.argv[2] || 'test';
runLoadTest(scenario).catch(error => {
  console.error('Load test failed:', error);
  process.exit(1);
});