/**
 * Result Patterns - Common result handling and flow control patterns
 * Eliminates duplicated success/error checking logic across the codebase
 */
import { logError } from "./utils.mjs";
import { createOidcError } from "./oidc-handler.mjs";

/**
 * Creates a success result
 * @param {*} data - Result data
 * @returns {Object} Success result object
 */
export const success = (data = {}) => ({ success: true, result: data });

/**
 * Creates an error result
 * @param {string} error - Error code
 * @param {string} description - Error description
 * @param {number} [status=400] - HTTP status code
 * @param {Object} [logData] - Additional data to log
 * @returns {Object} Error result object
 */
export const failure = (error, description, status = 400, logData = {}) => {
  logError(error, null, logData);
  return {
    success: false,
    error: createOidcError(error, description, status),
  };
};

/**
 * Safely executes a function and wraps result in success/failure pattern
 * @param {Function} fn - Function to execute
 * @param {string} errorCode - Error code if function fails
 * @param {string} errorDescription - Error description if function fails
 * @returns {Object} Result object
 */
export const safeExecute = async (fn, errorCode = "internal_error", errorDescription = "Operation failed") => {
  try {
    const result = await fn();
    return success(result);
  } catch (error) {
    return failure(errorCode, errorDescription, 500, { error: error.message });
  }
};

/**
 * Checks if a condition is true, returns failure if not
 * @param {boolean} condition - Condition to check
 * @param {string} error - Error code
 * @param {string} description - Error description
 * @param {number} [status=400] - HTTP status code
 * @param {Object} [logData] - Additional data to log
 * @returns {Object|null} Error result if condition fails, null if success
 */
export const requireTrue = (condition, error, description, status = 400, logData = {}) => {
  if (!condition) {
    return failure(error, description, status, logData);
  }
  return null;
};

/**
 * Chains result operations, stopping on first failure
 * @param {...Function} operations - Operations that return result objects
 * @returns {Function} Function that executes the chain
 */
export const chain = (...operations) => {
  return async (...args) => {
    let result = null;
    
    for (const operation of operations) {
      result = await operation(...args, result);
      if (result && !result.success) {
        return result;
      }
    }
    
    return result || success();
  };
};

/**
 * Processes a business logic result and returns appropriate response
 * @param {Object} result - Result from business logic
 * @returns {Object} Response object
 */
export const processResult = (result) => {
  if (!result.success) {
    return result.error;
  }
  return result.result;
};