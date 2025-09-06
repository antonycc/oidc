import { describe, it, expect, vi } from "vitest";
import {
  safeStringify,
  log,
  logError,
  maskSensitive,
  parseFormBody,
  createJsonResponse,
} from "../lib/utils.mjs";

describe("utils", () => {
  describe("safeStringify", () => {
    it("stringifies objects", () => {
      const obj = { key: "value" };
      expect(safeStringify(obj)).toBe(JSON.stringify(obj));
    });

    it("handles errors", () => {
      const error = new Error("test error");
      const result = JSON.parse(safeStringify(error));
      expect(result.name).toBe("Error");
      expect(result.message).toBe("test error");
      expect(result.stack).toBeDefined();
    });

    it("handles strings", () => {
      expect(safeStringify("test")).toBe("test");
    });

    it("handles numbers", () => {
      expect(safeStringify(42)).toBe("42");
    });

    it("handles circular references", () => {
      const circular = {};
      circular.self = circular;
      expect(safeStringify(circular)).toBe("[object Object]");
    });
  });

  describe("maskSensitive", () => {
    it("masks short values", () => {
      expect(maskSensitive("abc")).toBe("***");
      expect(maskSensitive("ab")).toBe("***");
      expect(maskSensitive("")).toBe("***");
    });

    it("masks long values with length", () => {
      expect(maskSensitive("password123")).toBe("***11chars");
    });

    it("masks long values without length", () => {
      expect(maskSensitive("password123", false)).toBe("***");
    });

    it("handles null/undefined", () => {
      expect(maskSensitive(null)).toBe("null");
      expect(maskSensitive(undefined)).toBe("null");
    });
  });

  describe("log", () => {
    it("creates structured log entries", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      log("test", "message", { key: "value" });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"level":"info"'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"msg":"test message {\\"key\\":\\"value\\"}"'));

      consoleSpy.mockRestore();
    });
  });

  describe("logError", () => {
    it("creates structured error log entries", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const error = new Error("test error");

      logError("test message", error, { context: "test" });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"level":"error"'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"msg":"test message"'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"err":{'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"extra":{"context":"test"}'));

      consoleSpy.mockRestore();
    });
  });

  describe("parseFormBody", () => {
    it("parses URL-encoded form data", () => {
      const event = {
        body: "key1=value1&key2=value2",
        headers: { "content-type": "application/x-www-form-urlencoded" },
      };

      const params = parseFormBody(event);

      expect(params.get("key1")).toBe("value1");
      expect(params.get("key2")).toBe("value2");
    });

    it("parses JSON data", () => {
      const event = {
        body: JSON.stringify({ key1: "value1", key2: "value2" }),
        headers: { "content-type": "application/json" },
      };

      const params = parseFormBody(event);

      expect(params.get("key1")).toBe("value1");
      expect(params.get("key2")).toBe("value2");
    });

    it("handles base64 encoded body", () => {
      const data = "key1=value1&key2=value2";
      const encoded = Buffer.from(data).toString("base64");
      const event = {
        body: encoded,
        isBase64Encoded: true,
        headers: { "content-type": "application/x-www-form-urlencoded" },
      };

      const params = parseFormBody(event);

      expect(params.get("key1")).toBe("value1");
      expect(params.get("key2")).toBe("value2");
    });

    it("handles malformed input gracefully", () => {
      const event = {
        body: "malformed",
        headers: { "content-type": "application/json" },
      };

      const params = parseFormBody(event);

      expect(params).toBeInstanceOf(URLSearchParams);
    });

    it("handles empty/null body", () => {
      const event = {
        body: null,
        headers: {},
      };

      const params = parseFormBody(event);

      expect(params).toBeInstanceOf(URLSearchParams);
      expect([...params.entries()]).toHaveLength(0);
    });
  });

  describe("createJsonResponse", () => {
    it("creates standard JSON response", () => {
      const response = createJsonResponse(200, { message: "success" });

      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toBe("application/json");
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.body).toBe(JSON.stringify({ message: "success" }));
    });

    it("allows custom headers", () => {
      const response = createJsonResponse(
        200,
        { data: "test" },
        {
          "cache-control": "public, max-age=3600",
          "custom-header": "value",
        },
      );

      expect(response.headers["cache-control"]).toBe("public, max-age=3600");
      expect(response.headers["custom-header"]).toBe("value");
      expect(response.headers["content-type"]).toBe("application/json");
    });
  });
});
