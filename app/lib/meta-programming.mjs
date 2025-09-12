/**
 * Meta-Programming Utilities - Advanced code generation and delegation
 * Introduces meta-programming patterns for ultra-minimal function creation
 */
import { createOidcFunction } from "./function-factory.mjs";

/**
 * Dynamic module generator using ES6 Proxy
 * Eliminates the need for explicit function definitions
 */
export const createDynamicOidcModule = () => {
  return new Proxy({}, {
    get(target, endpoint) {
      if (typeof endpoint === 'string') {
        return createOidcFunction(endpoint);
      }
      return undefined;
    }
  });
};

/**
 * Function expression generator for minimal syntax
 * @param {string} endpoint - OIDC endpoint name
 * @returns {Function} Arrow function expression
 */
export const oidcFn = (endpoint) => createOidcFunction(endpoint);

/**
 * Curry factory for endpoint-specific function creation
 * @param {string} endpoint - OIDC endpoint name  
 * @returns {Function} Curried function creator
 */
export const endpoint = (endpoint) => () => createOidcFunction(endpoint);

/**
 * One-liner module export generator
 * @param {string} endpoint - OIDC endpoint name
 * @returns {Object} Module with handler export
 */
export const module = (endpoint) => ({ handler: createOidcFunction(endpoint) });

/**
 * Dynamic endpoint registry using Proxy
 */
export const oidcEndpoints = createDynamicOidcModule();