import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import yaml from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = dirname(__dirname);

// Load OpenAPI specification
const openApiSpec = yaml.load(readFileSync(join(rootDir, "openapi.yaml"), "utf8"));

// Helper function to validate response against schema (basic validation)
function validateResponseSchema(response, expectedSchema) {
  // Basic schema validation - in production, use a proper JSON schema validator
  if (expectedSchema.type === "object" && expectedSchema.properties) {
    for (const [key, propSchema] of Object.entries(expectedSchema.properties)) {
      if (expectedSchema.required?.includes(key)) {
        expect(response).toHaveProperty(key);
      }
      if (response[key] !== undefined) {
        if (propSchema.type === "string") {
          expect(typeof response[key]).toBe("string");
        } else if (propSchema.type === "number") {
          expect(typeof response[key]).toBe("number");
        } else if (propSchema.type === "boolean") {
          expect(typeof response[key]).toBe("boolean");
        } else if (propSchema.type === "array") {
          expect(Array.isArray(response[key])).toBe(true);
        }
      }
    }
  }
}

test.describe("OpenAPI Specification Compliance Tests", () => {
  const BASE_URL = process.env.BASE_URL || "https://oidc.antonycc.com";

  test("API endpoints match OpenAPI specification", async ({ request }) => {
    // Test that all documented endpoints are accessible
    const paths = Object.keys(openApiSpec.paths);

    for (const path of paths) {
      const methods = Object.keys(openApiSpec.paths[path]);

      for (const method of methods) {
        const operation = openApiSpec.paths[path][method];
        const fullUrl = BASE_URL + path;

        console.log(`Testing ${method.toUpperCase()} ${path}`);

        // Make a basic request to verify endpoint exists
        if (method === "get") {
          const response = await request.get(fullUrl);
          // Should not return 404 (endpoint exists)
          expect(response.status()).not.toBe(404);
        }
      }
    }
  });

  test("/.well-known/openid-configuration returns valid discovery document", async ({ request }) => {
    const response = await request.get(`${BASE_URL}/.well-known/openid-configuration`);

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/json");

    const discoveryDoc = await response.json();

    // Validate against OpenAPI schema
    const schema = openApiSpec.components.schemas.OpenIdConfiguration;
    validateResponseSchema(discoveryDoc, schema);

    // Validate specific OIDC requirements
    expect(discoveryDoc.issuer).toEqual(BASE_URL);
    expect(discoveryDoc.authorization_endpoint).toEqual(`${BASE_URL}/authorize`);
    expect(discoveryDoc.token_endpoint).toEqual(`${BASE_URL}/token`);
    expect(discoveryDoc.userinfo_endpoint).toEqual(`${BASE_URL}/userinfo`);
    expect(discoveryDoc.jwks_uri).toEqual(`${BASE_URL}/jwks`);
    expect(discoveryDoc.scopes_supported).toContain("openid");
    expect(discoveryDoc.response_types_supported).toContain("code");
    expect(discoveryDoc.grant_types_supported).toContain("authorization_code");
  });

  test("/jwks returns valid JSON Web Key Set", async ({ request }) => {
    const response = await request.get(`${BASE_URL}/jwks`);

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/json");
    expect(response.headers()["cache-control"]).toContain("max-age=3600");

    const jwks = await response.json();

    // Validate against OpenAPI schema
    const schema = openApiSpec.components.schemas.JWKSet;
    validateResponseSchema(jwks, schema);

    // Validate JWKS structure
    expect(jwks).toHaveProperty("keys");
    expect(Array.isArray(jwks.keys)).toBe(true);
    expect(jwks.keys.length).toBeGreaterThan(0);

    // Validate each key
    for (const key of jwks.keys) {
      expect(key).toHaveProperty("kty");
      expect(key).toHaveProperty("use");
      expect(key).toHaveProperty("kid");
      expect(key.kty).toBe("RSA");
      expect(key.use).toBe("sig");
      expect(typeof key.kid).toBe("string");
    }
  });

  test("/authorize endpoint returns login form for GET request", async ({ request }) => {
    const authParams = new URLSearchParams({
      response_type: "code",
      client_id: "self-client",
      redirect_uri: `${BASE_URL}/post-auth.html`,
      scope: "openid email profile",
      state: "test-state-12345",
      nonce: "test-nonce-67890",
      code_challenge: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
      code_challenge_method: "S256",
    });

    const response = await request.get(`${BASE_URL}/authorize?${authParams}`);

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/html");

    const html = await response.text();
    expect(html).toContain("<form");
    expect(html).toContain("username");
    expect(html).toContain("password");
  });

  test("/authorize endpoint validates required parameters", async ({ request }) => {
    // Test missing client_id
    const response = await request.get(`${BASE_URL}/authorize?response_type=code`);

    // Should return error (400 or show error in HTML)
    const isErrorResponse =
      response.status() === 400 || (response.status() === 200 && (await response.text()).includes("error"));
    expect(isErrorResponse).toBe(true);
  });

  test("/token endpoint requires POST method", async ({ request }) => {
    const getResponse = await request.get(`${BASE_URL}/token`);
    expect(getResponse.status()).toBe(405); // Method Not Allowed

    const headResponse = await request.head(`${BASE_URL}/token`);
    expect(headResponse.status()).toBe(405);
  });

  test("/token endpoint validates request format", async ({ request }) => {
    // Test with missing grant_type
    const response = await request.post(`${BASE_URL}/token`, {
      form: {
        code: "test-code",
        client_id: "self-client",
        redirect_uri: `${BASE_URL}/callback`,
        code_verifier: "test-verifier",
      },
    });

    expect(response.status()).toBe(400);

    const errorResponse = await response.json();
    expect(errorResponse).toHaveProperty("error");
  });

  test("/userinfo endpoint requires Bearer token", async ({ request }) => {
    // Test without Authorization header
    const response1 = await request.get(`${BASE_URL}/userinfo`);
    expect(response1.status()).toBe(401);

    const errorResponse1 = await response1.json();
    expect(errorResponse1.error).toBe("invalid_request");

    // Test with invalid token
    const response2 = await request.get(`${BASE_URL}/userinfo`, {
      headers: {
        Authorization: "Bearer invalid-token",
      },
    });
    expect(response2.status()).toBe(401);

    const errorResponse2 = await response2.json();
    expect(errorResponse2.error).toBe("invalid_token");
  });

  test("OpenAPI spec is served correctly", async ({ request }) => {
    const response = await request.get(`${BASE_URL}/openapi.yaml`);

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toMatch(/yaml|text/);

    const specText = await response.text();
    expect(specText).toContain("openapi: 3.0.3");
    expect(specText).toContain("OpenID Connect Provider API");
  });

  test("Swagger UI is accessible", async ({ request }) => {
    const response = await request.get(`${BASE_URL}/swagger.html`);

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/html");

    const html = await response.text();
    expect(html).toContain("Swagger UI");
    expect(html).toContain("OpenID Connect Provider");
    expect(html).toContain("swagger-ui-bundle.js");
  });

  test("API responses match OpenAPI examples", async ({ request }) => {
    // Test discovery document example
    const discoveryResponse = await request.get(`${BASE_URL}/.well-known/openid-configuration`);
    const discoveryDoc = await discoveryResponse.json();

    const expectedExample =
      openApiSpec.paths["/.well-known/openid-configuration"].get.responses["200"].content["application/json"].example;

    // Check key fields match the example structure
    expect(discoveryDoc.issuer).toBe(BASE_URL);
    expect(discoveryDoc.scopes_supported).toEqual(expectedExample.scopes_supported);
    expect(discoveryDoc.response_types_supported).toEqual(expectedExample.response_types_supported);
    expect(discoveryDoc.grant_types_supported).toEqual(expectedExample.grant_types_supported);
    expect(discoveryDoc.subject_types_supported).toEqual(expectedExample.subject_types_supported);
  });

  test("Error responses follow RFC 6749 format", async ({ request }) => {
    // Test invalid token endpoint request
    const response = await request.post(`${BASE_URL}/token`, {
      form: {
        grant_type: "invalid_grant_type",
      },
    });

    expect(response.status()).toBe(400);

    const errorResponse = await response.json();
    const errorSchema = openApiSpec.components.schemas.ErrorResponse;
    validateResponseSchema(errorResponse, errorSchema);

    expect(errorResponse).toHaveProperty("error");
    expect(typeof errorResponse.error).toBe("string");

    if (errorResponse.error_description) {
      expect(typeof errorResponse.error_description).toBe("string");
    }
  });
});

test.describe("OpenAPI Specification Validation", () => {
  test("OpenAPI spec follows OpenAPI 3.0.3 format", async () => {
    // Basic structure validation
    expect(openApiSpec).toHaveProperty("openapi");
    expect(openApiSpec.openapi).toBe("3.0.3");
    expect(openApiSpec).toHaveProperty("info");
    expect(openApiSpec).toHaveProperty("paths");
    expect(openApiSpec).toHaveProperty("components");

    // Info section validation
    expect(openApiSpec.info).toHaveProperty("title");
    expect(openApiSpec.info).toHaveProperty("version");
    expect(openApiSpec.info).toHaveProperty("description");

    // Servers validation
    expect(openApiSpec).toHaveProperty("servers");
    expect(Array.isArray(openApiSpec.servers)).toBe(true);
    expect(openApiSpec.servers.length).toBeGreaterThan(0);

    // Components validation
    expect(openApiSpec.components).toHaveProperty("schemas");
    expect(openApiSpec.components).toHaveProperty("securitySchemes");
  });

  test("All endpoints have proper documentation", async () => {
    const requiredEndpoints = ["/.well-known/openid-configuration", "/authorize", "/token", "/userinfo", "/jwks"];

    for (const endpoint of requiredEndpoints) {
      expect(openApiSpec.paths).toHaveProperty(endpoint);

      const pathInfo = openApiSpec.paths[endpoint];
      const methods = Object.keys(pathInfo);

      for (const method of methods) {
        const operation = pathInfo[method];
        expect(operation).toHaveProperty("tags");
        expect(operation).toHaveProperty("summary");
        expect(operation).toHaveProperty("description");
        expect(operation).toHaveProperty("operationId");
        expect(operation).toHaveProperty("responses");

        // Check for 200 response
        expect(operation.responses).toHaveProperty("200");
      }
    }
  });

  test("All schemas are properly defined", async () => {
    const requiredSchemas = ["OpenIdConfiguration", "TokenResponse", "UserInfo", "JWKSet", "JWK", "ErrorResponse"];

    for (const schemaName of requiredSchemas) {
      expect(openApiSpec.components.schemas).toHaveProperty(schemaName);

      const schema = openApiSpec.components.schemas[schemaName];
      expect(schema).toHaveProperty("type");
      expect(schema).toHaveProperty("properties");

      if (schema.required) {
        expect(Array.isArray(schema.required)).toBe(true);
      }
    }
  });
});
