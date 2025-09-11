import { describe, test, expect } from "vitest";

describe("Demo Credentials Display", () => {
  test("demo credentials JSON file exists", async () => {
    // Simple test to verify the demo credentials file exists and has correct structure
    const fs = await import("fs");
    const path = await import("path");
    
    const credentialsPath = path.resolve("web/public-demo-credentials.json");
    expect(fs.existsSync(credentialsPath)).toBe(true);
    
    const credentialsContent = fs.readFileSync(credentialsPath, "utf-8");
    const credentials = JSON.parse(credentialsContent);
    
    expect(credentials).toHaveProperty("username");
    expect(credentials).toHaveProperty("password");
    expect(credentials).toHaveProperty("email");
    expect(credentials).toHaveProperty("name");
    expect(credentials).toHaveProperty("given_name");
    expect(credentials).toHaveProperty("family_name");
    
    // Verify they are non-empty strings
    expect(typeof credentials.username).toBe("string");
    expect(credentials.username.length).toBeGreaterThan(0);
    expect(typeof credentials.password).toBe("string");
    expect(credentials.password.length).toBeGreaterThan(0);
  });

  test("loginDirect.html contains demo credentials elements", async () => {
    // Simple test to verify the HTML contains the necessary elements
    const fs = await import("fs");
    const path = await import("path");
    
    const htmlPath = path.resolve("web/loginDirect.html");
    expect(fs.existsSync(htmlPath)).toBe(true);
    
    const htmlContent = fs.readFileSync(htmlPath, "utf-8");
    
    // Check for demo credentials section
    expect(htmlContent).toContain('id="demoCredentials"');
    expect(htmlContent).toContain('id="demoUsername"');
    expect(htmlContent).toContain('id="demoPassword"');
    expect(htmlContent).toContain('id="useDemoCredentials"');
    
    // Check for the credentials fetching JavaScript
    expect(htmlContent).toContain("loadDemoCredentials");
    expect(htmlContent).toContain("public-demo-credentials.json");
  });
});