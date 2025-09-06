import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getClient, validateRedirectUri } from "../lib/clients.mjs";

describe("clients dynamic configuration", () => {
  let originalCognitoEnv;
  let originalBaseUrlEnv;

  beforeEach(() => {
    originalBaseUrlEnv = process.env.BASE_URL;
  });

  afterEach(() => {
    if (originalBaseUrlEnv) {
      process.env.BASE_URL = originalBaseUrlEnv;
    } else {
      delete process.env.BASE_URL;
    }
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
});