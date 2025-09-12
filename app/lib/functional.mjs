/**
 * Functional Utilities - Higher-order functions and functional programming patterns
 * Replaces custom functional code with battle-tested library functions
 */
import * as R from "ramda";
import pRetry from "p-retry";
import ms from "ms";
import createError from "http-errors";
import { logError } from "./utils.mjs";

/**
 * Safe property access with default value
 * @param {string} path - Property path (dot notation)
 * @param {*} defaultValue - Default value if path not found
 * @param {Object} object - Object to access
 * @returns {*} Property value or default
 */
export const safeGet = R.pathOr;

/**
 * Pick specified properties from object
 * @param {Array<string>} props - Properties to pick
 * @param {Object} object - Source object
 * @returns {Object} New object with only specified properties
 */
export const pick = R.pick;

/**
 * Omit specified properties from object
 * @param {Array<string>} props - Properties to omit
 * @param {Object} object - Source object
 * @returns {Object} New object without specified properties
 */
export const omit = R.omit;

/**
 * Check if value is nil (null or undefined)
 * @param {*} value - Value to check
 * @returns {boolean} True if value is nil
 */
export const isNil = R.isNil;

/**
 * Check if value is not nil
 * @param {*} value - Value to check
 * @returns {boolean} True if value is not nil
 */
export const isNotNil = R.complement(R.isNil);

/**
 * Pipe functions together (left to right)
 * @param {...Function} functions - Functions to pipe
 * @returns {Function} Composed function
 */
export const pipe = R.pipe;

/**
 * Compose functions together (right to left)
 * @param {...Function} functions - Functions to compose
 * @returns {Function} Composed function
 */
export const compose = R.compose;

/**
 * Curry a function (enable partial application)
 * @param {Function} fn - Function to curry
 * @returns {Function} Curried function
 */
export const curry = R.curry;

/**
 * Map over an array with curried function
 * @param {Function} fn - Mapping function
 * @param {Array} array - Array to map over
 * @returns {Array} Mapped array
 */
export const map = R.map;

/**
 * Filter array with predicate function
 * @param {Function} predicate - Filter predicate
 * @param {Array} array - Array to filter
 * @returns {Array} Filtered array
 */
export const filter = R.filter;

/**
 * Find first element matching predicate
 * @param {Function} predicate - Search predicate
 * @param {Array} array - Array to search
 * @returns {*} First matching element or undefined
 */
export const find = R.find;

/**
 * Retry an async function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {Object} [options] - Retry options
 * @param {number} [options.retries=3] - Number of retries
 * @param {number} [options.factor=2] - Backoff factor
 * @param {number} [options.minTimeout=1000] - Minimum timeout
 * @param {number} [options.maxTimeout=30000] - Maximum timeout
 * @returns {Promise<*>} Result of function execution
 */
export const retry = async (fn, options = {}) => {
  const {
    retries = 3,
    factor = 2,
    minTimeout = 1000,
    maxTimeout = 30000,
    onFailedAttempt = () => {},
  } = options;

  return pRetry(fn, {
    retries,
    factor,
    minTimeout,
    maxTimeout,
    onFailedAttempt: (error) => {
      logError("retry_attempt_failed", error, { attempt: error.attemptNumber, retriesLeft: error.retriesLeft });
      onFailedAttempt(error);
    },
  });
};

/**
 * Parse time duration string to milliseconds
 * @param {string} duration - Duration string (e.g., '5m', '1h', '30s')
 * @returns {number} Milliseconds
 */
export const parseDuration = ms;

/**
 * Format milliseconds to human readable duration
 * @param {number} milliseconds - Milliseconds to format
 * @returns {string} Human readable duration
 */
export const formatDuration = (milliseconds) => ms(milliseconds, { long: true });

/**
 * Create standardized HTTP error
 * @param {number} status - HTTP status code
 * @param {string} message - Error message
 * @param {Object} [properties] - Additional error properties
 * @returns {Error} HTTP error object
 */
export const httpError = (status, message, properties = {}) => {
  const error = createError(status, message, properties);
  logError("http_error_created", null, { status, message, ...properties });
  return error;
};

/**
 * Memoize a function (cache results based on arguments)
 * @param {Function} fn - Function to memoize
 * @returns {Function} Memoized function
 */
export const memoize = R.memoizeWith(R.toString);

/**
 * Throttle a function (limit execution frequency)
 * @param {Function} fn - Function to throttle
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Throttled function
 */
export const throttle = R.throttle;

/**
 * Deep clone an object
 * @param {*} obj - Object to clone
 * @returns {*} Deep cloned object
 */
export const deepClone = R.clone;

/**
 * Merge objects deeply
 * @param {Object} obj1 - First object
 * @param {Object} obj2 - Second object
 * @returns {Object} Merged object
 */
export const deepMerge = R.mergeDeepRight;

/**
 * Check if all predicate functions return true
 * @param {Array<Function>} predicates - Array of predicate functions
 * @param {*} value - Value to test
 * @returns {boolean} True if all predicates pass
 */
export const allPass = R.allPass;

/**
 * Check if any predicate function returns true
 * @param {Array<Function>} predicates - Array of predicate functions  
 * @param {*} value - Value to test
 * @returns {boolean} True if any predicate passes
 */
export const anyPass = R.anyPass;