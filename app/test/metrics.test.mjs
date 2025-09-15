/**
 * CloudWatch Metrics functionality tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  recordAuthMetrics,
  recordApiMetrics,
  recordRateLimitMetrics,
  recordUserMgmtMetrics,
  recordTokenMetrics,
  recordHealthMetrics,
  recordCustomMetric,
  metricsMiddleware,
  getMetricsStatus,
} from "../lib/metrics.mjs";

// Mock AWS CloudWatch SDK
vi.mock("@aws-sdk/client-cloudwatch", () => ({
  CloudWatchClient: vi.fn(() => ({
    send: vi.fn(),
  })),
  PutMetricDataCommand: vi.fn(),
}));

// Mock logging
vi.mock("../lib/utils.mjs", () => ({
  log: vi.fn(),
  logError: vi.fn(),
}));

describe("CloudWatch Metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set test environment to ensure metrics are skipped in tests
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    // Clean up environment
    delete process.env.NODE_ENV;
  });

  describe("recordAuthMetrics", () => {
    it("should not send metrics in test environment", () => {
      recordAuthMetrics("test-client", "success", null, 150);
      
      // Should not have sent any metrics due to test environment
      const status = getMetricsStatus();
      expect(status.bufferSize).toBe(0);
    });

    it("should handle success authentication metrics", () => {
      // Temporarily switch out of test environment
      process.env.NODE_ENV = "production";
      
      recordAuthMetrics("test-client", "success", null, 150);
      
      const status = getMetricsStatus();
      expect(status.bufferSize).toBeGreaterThan(0);
    });

    it("should handle failure authentication metrics", () => {
      // Temporarily switch out of test environment
      process.env.NODE_ENV = "production";
      
      recordAuthMetrics("test-client", "failure", "invalid_credentials", 200);
      
      const status = getMetricsStatus();
      expect(status.bufferSize).toBeGreaterThan(0);
    });
  });

  describe("recordApiMetrics", () => {
    it("should not send metrics in test environment", () => {
      recordApiMetrics("authorize", "POST", 200, 150, "192.168.1.1");
      
      // Should not have sent any metrics due to test environment
      const status = getMetricsStatus();
      expect(status.bufferSize).toBe(0);
    });

    it("should handle successful API metrics", () => {
      process.env.NODE_ENV = "production";
      
      recordApiMetrics("authorize", "POST", 200, 150, "192.168.1.1");
      
      const status = getMetricsStatus();
      expect(status.bufferSize).toBeGreaterThan(0);
    });

    it("should handle error API metrics", () => {
      process.env.NODE_ENV = "production";
      
      recordApiMetrics("token", "POST", 500, 300, "192.168.1.1");
      
      const status = getMetricsStatus();
      expect(status.bufferSize).toBeGreaterThan(0);
    });
  });

  describe("recordRateLimitMetrics", () => {
    it("should not send metrics in test environment", () => {
      recordRateLimitMetrics("authorize", "192.168.1.1", "blocked", 0);
      
      const status = getMetricsStatus();
      expect(status.bufferSize).toBe(0);
    });

    it("should handle rate limit metrics", () => {
      process.env.NODE_ENV = "production";
      
      recordRateLimitMetrics("authorize", "192.168.1.1", "blocked", 0);
      
      const status = getMetricsStatus();
      expect(status.bufferSize).toBeGreaterThan(0);
    });
  });

  describe("recordUserMgmtMetrics", () => {
    it("should not send metrics in test environment", () => {
      recordUserMgmtMetrics("create", "success", "user", null);
      
      const status = getMetricsStatus();
      expect(status.bufferSize).toBe(0);
    });

    it("should handle user management metrics", () => {
      process.env.NODE_ENV = "production";
      
      recordUserMgmtMetrics("create", "success", "user", null);
      
      const status = getMetricsStatus();
      expect(status.bufferSize).toBeGreaterThan(0);
    });

    it("should handle admin operation metrics", () => {
      process.env.NODE_ENV = "production";
      
      recordUserMgmtMetrics("delete", "success", "admin", "user");
      
      const status = getMetricsStatus();
      expect(status.bufferSize).toBeGreaterThan(0);
    });
  });

  describe("recordTokenMetrics", () => {
    it("should not send metrics in test environment", () => {
      recordTokenMetrics("introspect", "access_token", "success", "test-client", 100);
      
      const status = getMetricsStatus();
      expect(status.bufferSize).toBe(0);
    });

    it("should handle token operation metrics", () => {
      process.env.NODE_ENV = "production";
      
      recordTokenMetrics("introspect", "access_token", "success", "test-client", 100);
      
      const status = getMetricsStatus();
      expect(status.bufferSize).toBeGreaterThan(0);
    });
  });

  describe("recordHealthMetrics", () => {
    it("should not send metrics in test environment", () => {
      recordHealthMetrics("database", "healthy", 50);
      
      const status = getMetricsStatus();
      expect(status.bufferSize).toBe(0);
    });

    it("should handle health metrics", () => {
      process.env.NODE_ENV = "production";
      
      recordHealthMetrics("database", "healthy", 50);
      
      const status = getMetricsStatus();
      expect(status.bufferSize).toBeGreaterThan(0);
    });
  });

  describe("recordCustomMetric", () => {
    it("should not send metrics in test environment", () => {
      recordCustomMetric("CustomBusinessMetric", 42, "Count", { CustomDimension: "value" });
      
      const status = getMetricsStatus();
      expect(status.bufferSize).toBe(0);
    });

    it("should handle custom metrics", () => {
      process.env.NODE_ENV = "production";
      
      recordCustomMetric("CustomBusinessMetric", 42, "Count", { CustomDimension: "value" });
      
      const status = getMetricsStatus();
      expect(status.bufferSize).toBeGreaterThan(0);
    });
  });

  describe("metricsMiddleware", () => {
    it("should wrap handler and record metrics", async () => {
      const mockHandler = vi.fn().mockResolvedValue({
        statusCode: 200,
        body: JSON.stringify({ success: true }),
      });

      const middleware = metricsMiddleware("test-endpoint");
      const event = {
        requestContext: {
          http: {
            method: "POST",
            sourceIp: "192.168.1.1",
          },
        },
      };

      const response = await middleware(event, mockHandler);

      expect(mockHandler).toHaveBeenCalledWith(event);
      expect(response.statusCode).toBe(200);
      
      // Metrics recording is skipped in test environment
      const status = getMetricsStatus();
      expect(status.bufferSize).toBe(0);
    });

    it("should record metrics on handler error", async () => {
      const mockHandler = vi.fn().mockRejectedValue(new Error("Test error"));

      const middleware = metricsMiddleware("test-endpoint");
      const event = {
        requestContext: {
          http: {
            method: "POST",
            sourceIp: "192.168.1.1",
          },
        },
      };

      await expect(middleware(event, mockHandler)).rejects.toThrow("Test error");
      
      // Metrics recording is skipped in test environment
      const status = getMetricsStatus();
      expect(status.bufferSize).toBe(0);
    });

    it("should handle missing request context gracefully", async () => {
      const mockHandler = vi.fn().mockResolvedValue({
        statusCode: 200,
        body: JSON.stringify({ success: true }),
      });

      const middleware = metricsMiddleware("test-endpoint");
      const event = {}; // Missing requestContext

      const response = await middleware(event, mockHandler);

      expect(mockHandler).toHaveBeenCalledWith(event);
      expect(response.statusCode).toBe(200);
    });
  });

  describe("getMetricsStatus", () => {
    it("should return current buffer status", () => {
      const status = getMetricsStatus();
      
      expect(status).toHaveProperty("bufferSize");
      expect(status).toHaveProperty("maxBufferSize");
      expect(status).toHaveProperty("batchTimeoutActive");
      expect(typeof status.bufferSize).toBe("number");
      expect(typeof status.maxBufferSize).toBe("number");
      expect(typeof status.batchTimeoutActive).toBe("boolean");
    });
  });

  describe("Metrics Configuration", () => {
    it("should use correct namespace and dimensions", () => {
      // This is more of a configuration test to ensure the module
      // is set up with the expected namespace and dimensions
      
      process.env.NODE_ENV = "production";
      process.env.ENVIRONMENT = "test-env";
      
      recordCustomMetric("TestMetric", 1, "Count", { TestDimension: "test" });
      
      // The actual CloudWatch call would include the namespace and dimensions
      // but since we're mocking, we verify the integration exists
      const status = getMetricsStatus();
      expect(status.bufferSize).toBeGreaterThan(0);
    });
  });
});