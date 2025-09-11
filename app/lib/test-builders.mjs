/**
 * Test data builders and factories for OIDC provider testing
 * Provides consistent test data generation and reduces test maintenance
 */
import { ulid } from "ulid";
import bcrypt from "bcryptjs";
import * as crypto from "node:crypto";
import { time, ttl } from "./time.mjs";

/**
 * Base builder class with common patterns
 */
class BaseBuilder {
  constructor(defaults = {}) {
    this.data = { ...defaults };
  }

  with(key, value) {
    this.data[key] = value;
    return this;
  }

  withOverrides(overrides) {
    Object.assign(this.data, overrides);
    return this;
  }

  build() {
    return { ...this.data };
  }
}

/**
 * User data builder
 */
export class UserBuilder extends BaseBuilder {
  constructor() {
    super({
      username: `test-user-${ulid()}`,
      password: "test-password",
      passwordHash: null, // Will be computed on build
      email: "test@example.com",
      emailVerified: false,
      name: "Test User",
      given_name: "Test",
      family_name: "User",
      created: time.nowIso(),
    });
  }

  withUsername(username) {
    return this.with("username", username);
  }

  withPassword(password) {
    return this.with("password", password);
  }

  withEmail(email) {
    return this.with("email", email);
  }

  withName(name, givenName = null, familyName = null) {
    this.with("name", name);
    if (givenName) this.with("given_name", givenName);
    if (familyName) this.with("family_name", familyName);
    return this;
  }

  verified() {
    return this.with("emailVerified", true);
  }

  build() {
    const user = super.build();

    // Generate password hash if not provided
    if (!user.passwordHash && user.password) {
      user.passwordHash = bcrypt.hashSync(user.password, 10);
    }

    // Remove plain password for security
    delete user.password;

    return user;
  }
}

/**
 * OIDC client configuration builder
 */
export class ClientBuilder extends BaseBuilder {
  constructor() {
    super({
      clientId: "test-client",
      clientSecret: null, // Public client by default
      redirectUris: ["http://localhost:3000/callback"],
      grantTypes: ["authorization_code"],
      scopes: ["openid", "email", "profile"],
      pkceRequired: true,
      responseTypes: ["code"],
    });
  }

  withClientId(clientId) {
    return this.with("clientId", clientId);
  }

  withSecret(clientSecret) {
    return this.with("clientSecret", clientSecret);
  }

  withRedirectUris(...uris) {
    return this.with("redirectUris", uris);
  }

  withScopes(...scopes) {
    return this.with("scopes", scopes);
  }

  requiresPkce(required = true) {
    return this.with("pkceRequired", required);
  }

  confidential() {
    return this.withSecret(`secret-${ulid()}`);
  }

  public() {
    return this.withSecret(null);
  }
}

/**
 * Authorization request builder
 */
export class AuthorizeRequestBuilder extends BaseBuilder {
  constructor() {
    super({
      client_id: "test-client",
      redirect_uri: "http://localhost:3000/callback",
      response_type: "code",
      scope: "openid email profile",
      state: ulid(),
      nonce: ulid(),
      username: "test-user",
      password: "test-password",
    });
  }

  withClient(clientId) {
    return this.with("client_id", clientId);
  }

  withRedirectUri(uri) {
    return this.with("redirect_uri", uri);
  }

  withScopes(...scopes) {
    return this.with("scope", scopes.join(" "));
  }

  withState(state) {
    return this.with("state", state);
  }

  withNonce(nonce) {
    return this.with("nonce", nonce);
  }

  withUser(username, password) {
    this.with("username", username);
    this.with("password", password);
    return this;
  }

  withPkce() {
    const codeVerifier = crypto.randomBytes(32).toString("base64url");
    const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");

    this.with("code_challenge", codeChallenge);
    this.with("code_challenge_method", "S256");
    this.with("_code_verifier", codeVerifier); // Store for token request
    return this;
  }

  getCodeVerifier() {
    return this.data._code_verifier;
  }
}

/**
 * Token request builder
 */
export class TokenRequestBuilder extends BaseBuilder {
  constructor() {
    super({
      grant_type: "authorization_code",
      client_id: "test-client",
      redirect_uri: "http://localhost:3000/callback",
      code: ulid(),
    });
  }

  withCode(code) {
    return this.with("code", code);
  }

  withClient(clientId) {
    return this.with("client_id", clientId);
  }

  withRedirectUri(uri) {
    return this.with("redirect_uri", uri);
  }

  withCodeVerifier(verifier) {
    return this.with("code_verifier", verifier);
  }

  withClientSecret(secret) {
    return this.with("client_secret", secret);
  }
}

/**
 * Authorization code storage builder
 */
export class AuthCodeBuilder extends BaseBuilder {
  constructor() {
    super({
      code: ulid(),
      client: "test-client",
      redirect: "http://localhost:3000/callback",
      scope: "openid email profile",
      sub: "test-user",
      used: false,
      ttl: ttl.authCode(),
    });
  }

  withCode(code) {
    return this.with("code", code);
  }

  withClient(client) {
    return this.with("client", client);
  }

  withSubject(sub) {
    return this.with("sub", sub);
  }

  withScopes(...scopes) {
    return this.with("scope", scopes.join(" "));
  }

  withPkce(challenge, method = "S256") {
    this.with("ch", challenge);
    this.with("ccm", method);
    return this;
  }

  withNonce(nonce) {
    return this.with("nonce", nonce);
  }

  used() {
    return this.with("used", true);
  }

  expired() {
    return this.with("ttl", time.nowSeconds() - 60); // 1 minute ago
  }

  withTtl(seconds) {
    return this.with("ttl", ttl.custom(seconds));
  }
}

/**
 * Factory functions for common test scenarios
 */
export const testData = {
  /**
   * Create a basic test user
   */
  user: (overrides = {}) => new UserBuilder().withOverrides(overrides),

  /**
   * Create a public OIDC client
   */
  publicClient: (overrides = {}) => new ClientBuilder().public().withOverrides(overrides),

  /**
   * Create a confidential OIDC client
   */
  confidentialClient: (overrides = {}) => new ClientBuilder().confidential().withOverrides(overrides),

  /**
   * Create an authorization request with PKCE
   */
  authRequest: (overrides = {}) => new AuthorizeRequestBuilder().withPkce().withOverrides(overrides),

  /**
   * Create a token request
   */
  tokenRequest: (overrides = {}) => new TokenRequestBuilder().withOverrides(overrides),

  /**
   * Create a valid authorization code
   */
  authCode: (overrides = {}) => new AuthCodeBuilder().withOverrides(overrides),

  /**
   * Create a complete authorization flow test data set
   */
  authFlow: (options = {}) => {
    const user = testData.user(options.user).build();
    const client = testData.publicClient(options.client).build();
    const authRequest = testData
      .authRequest({
        client_id: client.clientId,
        username: user.username,
        ...options.authRequest,
      })
      .build();

    const authCode = testData
      .authCode({
        client: client.clientId,
        sub: user.username,
        redirect: authRequest.redirect_uri,
        scope: authRequest.scope,
        nonce: authRequest.nonce,
        ch: authRequest.code_challenge,
        ccm: authRequest.code_challenge_method,
        ...options.authCode,
      })
      .build();

    const tokenRequest = testData
      .tokenRequest({
        client_id: client.clientId,
        redirect_uri: authRequest.redirect_uri,
        code: authCode.code,
        code_verifier: authRequest._code_verifier,
        ...options.tokenRequest,
      })
      .build();

    return {
      user,
      client,
      authRequest,
      authCode,
      tokenRequest,
    };
  },
};
