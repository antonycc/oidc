/**
 * Minimal Function Delegator - Ultimate code reduction through pure delegation
 * Single symbol exports for maximum abstraction
 */
import { oidc } from "./ultra-abstraction.mjs";

/**
 * Pure delegation exports - single symbol per endpoint
 * Eliminates all variable assignment and explicit handler references
 */
export const authorize = oidc.authorize;
export const token = oidc.token;
export const userinfo = oidc.userinfo;
export const jwks = oidc.jwks;

/**
 * Delegation factory for dynamic endpoint access
 * @param {string} endpoint - OIDC endpoint name
 * @returns {Function} Handler function via pure delegation
 */
export const delegate = (endpoint) => oidc[endpoint];

/**
 * Single-line handler factory via delegation
 */
export const λ = delegate;