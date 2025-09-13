#!/usr/bin/env node

/**
 * Simple OpenAPI validation script for local testing
 * Validates the OpenAPI spec structure without requiring deployment
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import yaml from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = dirname(__dirname);

console.log("🔍 Validating OpenAPI specification...");

try {
  // Load and parse OpenAPI spec
  const specPath = join(rootDir, "openapi.yaml");
  const specContent = readFileSync(specPath, "utf8");
  const spec = yaml.load(specContent);

  console.log("✅ OpenAPI YAML parsing: SUCCESS");

  // Basic structure validation
  const requiredFields = ["openapi", "info", "paths", "components"];
  for (const field of requiredFields) {
    if (!spec[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  console.log("✅ OpenAPI structure validation: SUCCESS");

  // Validate OpenAPI version
  if (spec.openapi !== "3.0.3") {
    throw new Error(`Expected OpenAPI version 3.0.3, got ${spec.openapi}`);
  }
  console.log("✅ OpenAPI version validation: SUCCESS");

  // Validate info section
  if (!spec.info.title || !spec.info.version || !spec.info.description) {
    throw new Error("Missing required info fields (title, version, description)");
  }
  console.log("✅ Info section validation: SUCCESS");

  // Validate required endpoints
  const requiredEndpoints = ["/.well-known/openid-configuration", "/authorize", "/token", "/userinfo", "/jwks"];

  for (const endpoint of requiredEndpoints) {
    if (!spec.paths[endpoint]) {
      throw new Error(`Missing required endpoint: ${endpoint}`);
    }
  }
  console.log("✅ Required endpoints validation: SUCCESS");

  // Validate schemas
  const requiredSchemas = ["OpenIdConfiguration", "TokenResponse", "UserInfo", "JWKSet", "JWK", "ErrorResponse"];

  for (const schema of requiredSchemas) {
    if (!spec.components.schemas[schema]) {
      throw new Error(`Missing required schema: ${schema}`);
    }
  }
  console.log("✅ Required schemas validation: SUCCESS");

  // Validate each endpoint has proper documentation
  let totalOperations = 0;
  for (const [path, pathInfo] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(pathInfo)) {
      totalOperations++;

      const requiredOperationFields = ["tags", "summary", "description", "operationId", "responses"];
      for (const field of requiredOperationFields) {
        if (!operation[field]) {
          throw new Error(`Missing ${field} in ${method.toUpperCase()} ${path}`);
        }
      }

      // Validate success response exists (200, 201, 302, etc.)
      const hasSuccessResponse = Object.keys(operation.responses).some(
        (status) => status.startsWith("2") || status === "302",
      );
      if (!hasSuccessResponse) {
        throw new Error(`Missing success response in ${method.toUpperCase()} ${path}`);
      }
    }
  }
  console.log(`✅ Operations documentation validation: SUCCESS (${totalOperations} operations)`);

  // Validate examples exist
  let exampleCount = 0;
  for (const [path, pathInfo] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(pathInfo)) {
      for (const [status, response] of Object.entries(operation.responses)) {
        if (response.content) {
          for (const [mediaType, mediaTypeObject] of Object.entries(response.content)) {
            if (mediaTypeObject.example || mediaTypeObject.examples) {
              exampleCount++;
            }
          }
        }
      }

      // Check request body examples
      if (operation.requestBody?.content) {
        for (const [mediaType, mediaTypeObject] of Object.entries(operation.requestBody.content)) {
          if (mediaTypeObject.example || mediaTypeObject.examples) {
            exampleCount++;
          }
        }
      }
    }
  }
  console.log(`✅ Examples validation: SUCCESS (${exampleCount} examples found)`);

  // Summary
  console.log("\n🎉 OpenAPI Specification Validation Complete!");
  console.log(`   📄 Specification: ${spec.info.title} v${spec.info.version}`);
  console.log(`   🔗 Endpoints: ${requiredEndpoints.length} documented`);
  console.log(`   ⚙️  Operations: ${totalOperations} total`);
  console.log(`   📋 Schemas: ${requiredSchemas.length} defined`);
  console.log(`   📝 Examples: ${exampleCount} provided`);
  console.log(`   🌐 Servers: ${spec.servers?.length || 0} configured`);
} catch (error) {
  console.error("❌ OpenAPI validation failed:", error.message);
  process.exit(1);
}
