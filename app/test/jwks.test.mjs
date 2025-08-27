import { describe, it, expect } from "vitest";
import { handler } from "../functions/jwks.mjs";

describe("jwks", () => {
  it("returns valid JWKS format", async () => {
    const event = {
      requestContext: { http: { method: "GET" } }
    };

    const response = await handler(event);

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("application/json");
    expect(response.headers["cache-control"]).toBe("public, max-age=3600");
    
    const jwks = JSON.parse(response.body);
    expect(jwks).toHaveProperty("keys");
    expect(Array.isArray(jwks.keys)).toBe(true);
    expect(jwks.keys.length).toBeGreaterThan(0);
    
    const key = jwks.keys[0];
    expect(key).toHaveProperty("kty", "RSA");
    expect(key).toHaveProperty("use", "sig");
    expect(key).toHaveProperty("alg", "RS256");
    expect(key).toHaveProperty("kid", "kid-1");
    expect(key).toHaveProperty("n");
    expect(key).toHaveProperty("e");
  });
});