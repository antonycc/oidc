/**
 * Rate limiting functionality tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  checkRateLimit,
  recordAttempt,
  getClientIp,
  rateLimitMiddleware,
  recordAuthFailure,
  clearRateLimit,
} from "../lib/rate-limiting.mjs";

// Mock the database functions
vi.mock("../lib/db.mjs", () => ({
  put: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  tables: {
    codes: "mock-codes-table",
  },
}));

// Mock logging functions
vi.mock("../lib/utils.mjs", () => ({
  log: vi.fn(),
  logError: vi.fn(),
}));

import { put, get } from "../lib/db.mjs";

describe("Rate Limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00.000Z"));
    // Override NODE_ENV to enable rate limiting functionality during tests
    vi.stubEnv('NODE_ENV', 'development');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  describe("getClientIp", () => {
    it("should extract IP from CloudFront header", () => {
      const event = {
        headers: {
          "cloudfront-viewer-address": "192.168.1.1:12345",
        },
      };

      const ip = getClientIp(event);
      expect(ip).toBe("192.168.1.1");
    });

    it("should extract IP from X-Forwarded-For header", () => {
      const event = {
        headers: {
          "x-forwarded-for": "192.168.1.1, 10.0.0.1",
        },
      };

      const ip = getClientIp(event);
      expect(ip).toBe("192.168.1.1");
    });

    it("should fallback to sourceIp from request context", () => {
      const event = {
        requestContext: {
          http: {
            sourceIp: "192.168.1.1",
          },
        },
      };

      const ip = getClientIp(event);
      expect(ip).toBe("192.168.1.1");
    });

    it("should return unknown if no IP found", () => {
      const event = {};
      const ip = getClientIp(event);
      expect(ip).toBe("unknown");
    });
  });

  describe("checkRateLimit", () => {
    it("should allow requests for endpoints without rate limits", async () => {
      const result = await checkRateLimit("nonexistent", "192.168.1.1");
      
      expect(result).toEqual({
        allowed: true,
        remaining: Infinity,
        resetTime: 0,
      });
    });

    it("should allow first request with no previous attempts", async () => {
      get.mockResolvedValue(null);

      const result = await checkRateLimit("authorize", "192.168.1.1");

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(19); // 20 max - 1 for this request
      expect(result.resetTime).toBe(1735689600 + 300); // Current time + 300 seconds (authorize window)
    });

    it("should allow requests within rate limits", async () => {
      const now = Math.floor(Date.now() / 1000);
      get.mockResolvedValue({
        attempts: [now - 100, now - 50], // 2 recent attempts
        blockedUntil: 0,
      });

      const result = await checkRateLimit("authorize", "192.168.1.1");

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(17); // 20 max - 2 previous - 1 current
    });

    it("should block requests that exceed rate limits", async () => {
      const now = Math.floor(Date.now() / 1000);
      // Generate 20 attempts within the window (hitting the limit)
      const attempts = Array.from({ length: 20 }, (_, i) => now - i * 10);
      
      get.mockResolvedValue({
        attempts,
        blockedUntil: 0,
      });

      const result = await checkRateLimit("authorize", "192.168.1.1");

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("should respect existing blocks", async () => {
      const now = Math.floor(Date.now() / 1000);
      get.mockResolvedValue({
        attempts: [],
        blockedUntil: now + 600, // Blocked for 10 more minutes
      });

      const result = await checkRateLimit("authorize", "192.168.1.1");

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.resetTime).toBe(now + 600);
    });

    it("should filter out old attempts outside the window", async () => {
      const now = Math.floor(Date.now() / 1000);
      get.mockResolvedValue({
        attempts: [
          now - 400, // Outside 5-minute window
          now - 100, // Within window
          now - 50,  // Within window
        ],
        blockedUntil: 0,
      });

      const result = await checkRateLimit("authorize", "192.168.1.1");

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(17); // Only 2 recent attempts count
    });

    it("should fail open on database errors", async () => {
      get.mockRejectedValue(new Error("Database error"));

      const result = await checkRateLimit("authorize", "192.168.1.1");

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(Infinity);
    });
  });

  describe("recordAttempt", () => {
    it("should record first attempt", async () => {
      get.mockResolvedValue(null);
      const now = Math.floor(Date.now() / 1000);

      await recordAttempt("authorize", "192.168.1.1", false);

      expect(put).toHaveBeenCalledWith("mock-codes-table", {
        id: "ratelimit:authorize:192.168.1.1",
        attempts: [now],
        blockedUntil: 0,
        ttl: now + 360, // 300 + 60 buffer
        lastUpdated: now,
        endpoint: "authorize",
        clientIp: "192.168.1.1",
      });
    });

    it("should add to existing attempts", async () => {
      const now = Math.floor(Date.now() / 1000);
      get.mockResolvedValue({
        attempts: [now - 100],
        blockedUntil: 0,
      });

      await recordAttempt("authorize", "192.168.1.1", false);

      expect(put).toHaveBeenCalledWith("mock-codes-table", {
        id: "ratelimit:authorize:192.168.1.1",
        attempts: [now - 100, now],
        blockedUntil: 0,
        ttl: now + 360,
        lastUpdated: now,
        endpoint: "authorize",
        clientIp: "192.168.1.1",
      });
    });

    it("should block after too many failures", async () => {
      const now = Math.floor(Date.now() / 1000);
      // 4 existing attempts within window (19 more to hit authorize limit)
      const attempts = [now - 200, now - 150, now - 100, now - 50];
      get.mockResolvedValue({
        attempts,
        blockedUntil: 0,
      });

      // This should NOT cause blocking for 'authorize' endpoint since it needs 20 attempts
      await recordAttempt("authorize", "192.168.1.1", true); // 5th attempt, not enough to block

      expect(put).toHaveBeenCalledWith("mock-codes-table", {
        id: "ratelimit:authorize:192.168.1.1",
        attempts: [...attempts, now],
        blockedUntil: 0, // No block yet - need 20 attempts for authorize
        ttl: now + 360, // Window + buffer  
        lastUpdated: now,
        endpoint: "authorize",
        clientIp: "192.168.1.1",
      });
    });

    it("should block after too many auth failures", async () => {
      const now = Math.floor(Date.now() / 1000);
      // 4 existing failed auth attempts within window  
      const attempts = [now - 200, now - 150, now - 100, now - 50];
      get.mockResolvedValue({
        attempts,
        blockedUntil: 0,
      });

      await recordAttempt("authFailure", "192.168.1.1", true); // 5th failure - should block

      expect(put).toHaveBeenCalledWith("mock-codes-table", {
        id: "ratelimit:authFailure:192.168.1.1",
        attempts: [...attempts, now],
        blockedUntil: now + 1800, // Block duration for authFailure (30 min)
        ttl: now + 1860, // Block time + 60 buffer
        lastUpdated: now,
        endpoint: "authFailure",
        clientIp: "192.168.1.1",
      });
    });

    it("should filter out old attempts when recording", async () => {
      const now = Math.floor(Date.now() / 1000);
      get.mockResolvedValue({
        attempts: [now - 400, now - 100], // One old, one recent
        blockedUntil: 0,
      });

      await recordAttempt("authorize", "192.168.1.1", false);

      expect(put).toHaveBeenCalledWith("mock-codes-table", {
        id: "ratelimit:authorize:192.168.1.1",
        attempts: [now - 100, now], // Old attempt filtered out
        blockedUntil: 0,
        ttl: now + 360,
        lastUpdated: now,
        endpoint: "authorize",
        clientIp: "192.168.1.1",
      });
    });

    it("should do nothing for endpoints without rate limits", async () => {
      await recordAttempt("nonexistent", "192.168.1.1", false);
      expect(put).not.toHaveBeenCalled();
    });

    it("should continue on database errors", async () => {
      get.mockRejectedValue(new Error("Database error"));

      // Should not throw
      await expect(recordAttempt("authorize", "192.168.1.1")).resolves.toBeUndefined();
    });
  });

  describe("rateLimitMiddleware", () => {
    it("should apply rate limiting and call next handler", async () => {
      get.mockResolvedValue(null); // No previous attempts
      
      const middleware = rateLimitMiddleware("authorize");
      const event = {
        headers: { "cloudfront-viewer-address": "192.168.1.1:12345" },
      };
      
      const mockNext = vi.fn().mockResolvedValue({
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: true }),
      });

      const result = await middleware(event, mockNext);

      expect(mockNext).toHaveBeenCalledWith(event);
      expect(result.headers["X-RateLimit-Limit"]).toBe("20");
      expect(result.headers["X-RateLimit-Remaining"]).toBe("19");
      expect(put).toHaveBeenCalled(); // Attempt was recorded
    });

    it("should return 429 when rate limited", async () => {
      const now = Math.floor(Date.now() / 1000);
      // Mock rate limit exceeded
      const attempts = Array.from({ length: 20 }, (_, i) => now - i * 10);
      get.mockResolvedValue({
        attempts,
        blockedUntil: 0,
      });

      const middleware = rateLimitMiddleware("authorize");
      const event = {
        headers: { "cloudfront-viewer-address": "192.168.1.1:12345" },
      };
      
      const mockNext = vi.fn();

      const result = await middleware(event, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(result.statusCode).toBe(429);
      expect(result.headers["Retry-After"]).toBeDefined();
      expect(JSON.parse(result.body).error).toBe("rate_limit_exceeded");
    });
  });

  describe("recordAuthFailure", () => {
    it("should record auth failure with blocking", async () => {
      get.mockResolvedValue(null);

      await recordAuthFailure("192.168.1.1", "testuser");

      expect(put).toHaveBeenCalledWith(
        "mock-codes-table",
        expect.objectContaining({
          id: "ratelimit:authFailure:192.168.1.1",
          endpoint: "authFailure",
          clientIp: "192.168.1.1",
        })
      );
    });
  });

  describe("clearRateLimit", () => {
    it("should clear rate limit data", async () => {
      const now = Math.floor(Date.now() / 1000);

      await clearRateLimit("authorize", "192.168.1.1");

      expect(put).toHaveBeenCalledWith("mock-codes-table", {
        id: "ratelimit:authorize:192.168.1.1",
        attempts: [],
        blockedUntil: 0,
        ttl: now + 1, // Expire immediately
      });
    });
  });
});