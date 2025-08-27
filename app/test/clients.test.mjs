import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getClient, validateRedirectUri } from "../lib/clients.mjs";

describe("clients dynamic configuration", () => {
  let originalCognitoEnv;
  let originalBaseUrlEnv;

  beforeEach(() => {
    originalCognitoEnv = process.env.COGNITO_DOMAIN;
    originalBaseUrlEnv = process.env.BASE_URL;
  });

  afterEach(() => {
    if (originalCognitoEnv) {
      process.env.COGNITO_DOMAIN = originalCognitoEnv;
    } else {
      delete process.env.COGNITO_DOMAIN;
    }
    if (originalBaseUrlEnv) {
      process.env.BASE_URL = originalBaseUrlEnv;
    } else {
      delete process.env.BASE_URL;
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

  it("gets self-client configuration", () => {
    const client = getClient("self-client");
    expect(client).toBeTruthy();
    expect(client.grantTypes).toEqual(["authorization_code"]);
    expect(client.scopes).toEqual(["openid", "email", "profile"]);
    expect(client.pkceRequired).toBe(true);
    expect(client.clientSecret).toBeNull();
  });

  it("rejects invalid self-client redirect URI", () => {
    process.env.BASE_URL = "https://test.example.com";
    
    const isValid = validateRedirectUri(
      "self-client", 
      "https://evil.com/post-auth.html"
    );
    expect(isValid).toBe(false);
  });

  it("gets demo-client configuration", () => {
    const client = getClient("demo-client");
    expect(client).toBeTruthy();
    expect(client.grantTypes).toEqual(["authorization_code"]);
    expect(client.scopes).toEqual(["openid", "email", "profile"]);
    expect(client.pkceRequired).toBe(true);
    expect(client.clientSecret).toBeNull();
    expect(client.redirectUris).toEqual(["https://example.com/callback"]);
  });

  it("validates demo-client redirect URI", () => {
    const isValid = validateRedirectUri(
      "demo-client", 
      "https://example.com/callback"
    );
    expect(isValid).toBe(true);
  });

  it("rejects invalid demo-client redirect URI", () => {
    const isValid = validateRedirectUri(
      "demo-client", 
      "https://evil.com/callback"
    );
    expect(isValid).toBe(false);
  });
});