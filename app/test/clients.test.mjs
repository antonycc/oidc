import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getClient, validateRedirectUri } from "../lib/clients.mjs";

describe("clients dynamic configuration", () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env.COGNITO_DOMAIN;
  });

  afterEach(() => {
    if (originalEnv) {
      process.env.COGNITO_DOMAIN = originalEnv;
    } else {
      delete process.env.COGNITO_DOMAIN;
    }
  });

  it("uses environment variable for Cognito domain", () => {
    process.env.COGNITO_DOMAIN = "test-domain.auth.us-east-1.amazoncognito.com";
    
    const client = getClient("cognito-web");
    expect(client).toBeTruthy();
    expect(client.redirectUris).toEqual([
      "https://test-domain.auth.us-east-1.amazoncognito.com/oauth2/idpresponse"
    ]);
  });

  it("falls back to placeholder when environment variable not set", () => {
    delete process.env.COGNITO_DOMAIN;
    
    const client = getClient("cognito-web");
    expect(client).toBeTruthy();
    expect(client.redirectUris).toEqual([
      "https://YOUR_COGNITO_DOMAIN.auth.us-east-1.amazoncognito.com/oauth2/idpresponse"
    ]);
  });

  it("validates redirect URI with environment variable", () => {
    process.env.COGNITO_DOMAIN = "test-domain.auth.us-east-1.amazoncognito.com";
    
    const isValid = validateRedirectUri(
      "cognito-web", 
      "https://test-domain.auth.us-east-1.amazoncognito.com/oauth2/idpresponse"
    );
    expect(isValid).toBe(true);
  });

  it("rejects invalid redirect URI", () => {
    process.env.COGNITO_DOMAIN = "test-domain.auth.us-east-1.amazoncognito.com";
    
    const isValid = validateRedirectUri(
      "cognito-web", 
      "https://evil.com/callback"
    );
    expect(isValid).toBe(false);
  });
});