/**
 * Ultra Function Abstraction - Single entry point for all OIDC function creation
 * Consolidates meta-programming, factory patterns, and dynamic generation
 */
import { oidcHandlers } from "./oidc-ops.mjs";

/**
 * Unified OIDC function abstraction with multiple access patterns
 */
export class UltraOidcAbstraction {
  /**
   * Direct endpoint access via property
   * @param {string} endpoint - OIDC endpoint name
   * @returns {Function} OIDC handler function
   */
  static get(endpoint) {
    return oidcHandlers[endpoint];
  }

  /**
   * Curried function creator
   * @param {string} endpoint - OIDC endpoint name
   * @returns {Function} Handler function
   */
  static fn(endpoint) {
    return this.get(endpoint);
  }

  /**
   * Module generator for ES6 exports
   * @param {string} endpoint - OIDC endpoint name
   * @returns {Object} Module with handler export
   */
  static module(endpoint) {
    return { handler: this.get(endpoint) };
  }
}

/**
 * Dynamic proxy for property-based access
 * Provides intuitive dot notation access to OIDC handlers
 */
const createOidcProxy = () => {
  return new Proxy(UltraOidcAbstraction, {
    get(target, endpoint) {
      if (typeof endpoint === 'string' && oidcHandlers[endpoint]) {
        return oidcHandlers[endpoint];
      }
      return target[endpoint];
    }
  });
};

/**
 * Single consolidated export for all OIDC function needs
 * Supports multiple access patterns:
 * - oidc.authorize (proxy access)
 * - oidc.get('authorize') (method access)
 * - oidc.fn('authorize') (functional access)
 * - oidc.module('authorize') (module access)
 */
export const oidc = createOidcProxy();