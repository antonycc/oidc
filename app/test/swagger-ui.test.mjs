import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("Swagger UI Configuration", () => {
  it("should not contain problematic StandaloneLayout configuration", () => {
    const swaggerHtmlPath = join(process.cwd(), "web", "swagger.html");
    const swaggerHtml = readFileSync(swaggerHtmlPath, "utf8");

    // Should not contain the problematic layout configuration
    expect(swaggerHtml).not.toContain('layout: "StandaloneLayout"');

    // Should still contain the necessary Swagger UI bundle
    expect(swaggerHtml).toContain("SwaggerUIBundle");

    // Should contain the proper presets
    expect(swaggerHtml).toContain("SwaggerUIBundle.presets.apis");
    expect(swaggerHtml).toContain("SwaggerUIBundle.presets.standalone");

    // Should contain the essential configuration
    expect(swaggerHtml).toContain("deepLinking: true");
  });

  it("should contain proper error handling", () => {
    const swaggerHtmlPath = join(process.cwd(), "web", "swagger.html");
    const swaggerHtml = readFileSync(swaggerHtmlPath, "utf8");

    // Should have onComplete handler
    expect(swaggerHtml).toContain("onComplete:");

    // Should have onFailure handler
    expect(swaggerHtml).toContain("onFailure:");
  });
});
