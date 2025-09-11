/**
 * Date and time utilities using date-fns
 * Provides consistent date handling and TTL management
 */
import { addSeconds, addDays, isAfter, formatISO } from "date-fns";

/**
 * Time utilities for OIDC provider
 */
export const time = {
  /**
   * Get current Unix timestamp in seconds
   * @returns {number} Current timestamp in seconds
   */
  nowSeconds() {
    return Math.floor(Date.now() / 1000);
  },

  /**
   * Get current ISO timestamp string
   * @returns {string} ISO timestamp
   */
  nowIso() {
    return formatISO(new Date());
  },

  /**
   * Convert Date to Unix timestamp in seconds
   * @param {Date} date - Date to convert
   * @returns {number} Unix timestamp in seconds
   */
  toSeconds(date) {
    return Math.floor(date.getTime() / 1000);
  },

  /**
   * Convert Unix timestamp seconds to Date
   * @param {number} seconds - Unix timestamp in seconds
   * @returns {Date} Date object
   */
  fromSeconds(seconds) {
    return new Date(seconds * 1000);
  },

  /**
   * Check if a Unix timestamp has expired
   * @param {number} ttl - TTL timestamp in seconds
   * @returns {boolean} True if expired
   */
  isExpired(ttl) {
    return ttl <= this.nowSeconds();
  },

  /**
   * Check if a Date has passed
   * @param {Date} date - Date to check
   * @returns {boolean} True if date is in the past
   */
  isPast(date) {
    return isAfter(new Date(), date);
  },
};

/**
 * TTL (Time To Live) utilities for tokens and codes
 */
export const ttl = {
  /**
   * Create TTL timestamp for authorization codes (default: 3 minutes)
   * @param {number} seconds - TTL duration in seconds (default: 180)
   * @returns {number} Unix timestamp in seconds
   */
  authCode(seconds = 180) {
    return time.toSeconds(addSeconds(new Date(), seconds));
  },

  /**
   * Create TTL timestamp for access tokens (default: 5 minutes)
   * @param {number} seconds - TTL duration in seconds (default: 300)
   * @returns {number} Unix timestamp in seconds
   */
  accessToken(seconds = 300) {
    return time.toSeconds(addSeconds(new Date(), seconds));
  },

  /**
   * Create TTL timestamp for ID tokens (default: 5 minutes)
   * @param {number} seconds - TTL duration in seconds (default: 300)
   * @returns {number} Unix timestamp in seconds
   */
  idToken(seconds = 300) {
    return time.toSeconds(addSeconds(new Date(), seconds));
  },

  /**
   * Create TTL timestamp for refresh tokens (default: 7 days)
   * @param {number} days - TTL duration in days (default: 7)
   * @returns {number} Unix timestamp in seconds
   */
  refreshToken(days = 7) {
    return time.toSeconds(addDays(new Date(), days));
  },

  /**
   * Create TTL timestamp for key storage (default: 365 days)
   * @param {number} days - TTL duration in days (default: 365)
   * @returns {number} Unix timestamp in seconds
   */
  keyStorage(days = 365) {
    return time.toSeconds(addDays(new Date(), days));
  },

  /**
   * Create custom TTL timestamp
   * @param {number} seconds - TTL duration in seconds
   * @returns {number} Unix timestamp in seconds
   */
  custom(seconds) {
    return time.toSeconds(addSeconds(new Date(), seconds));
  },

  /**
   * Check if TTL has expired
   * @param {number} ttlTimestamp - TTL timestamp to check
   * @returns {boolean} True if expired
   */
  isExpired(ttlTimestamp) {
    return time.isExpired(ttlTimestamp);
  },

  /**
   * Get time remaining until expiration
   * @param {number} ttlTimestamp - TTL timestamp
   * @returns {number} Seconds remaining (negative if expired)
   */
  remaining(ttlTimestamp) {
    return ttlTimestamp - time.nowSeconds();
  },
};

/**
 * JWT timestamp utilities
 */
export const jwt = {
  /**
   * Create JWT 'iat' (issued at) claim
   * @returns {number} Unix timestamp in seconds
   */
  issuedAt() {
    return time.nowSeconds();
  },

  /**
   * Create JWT 'exp' (expiration) claim
   * @param {number} seconds - Seconds from now (default: 300)
   * @returns {number} Unix timestamp in seconds
   */
  expiresIn(seconds = 300) {
    return time.nowSeconds() + seconds;
  },

  /**
   * Create JWT 'nbf' (not before) claim
   * @param {number} seconds - Seconds from now (default: 0)
   * @returns {number} Unix timestamp in seconds
   */
  notBefore(seconds = 0) {
    return time.nowSeconds() + seconds;
  },

  /**
   * Check if JWT timestamp is expired
   * @param {number} exp - JWT exp claim
   * @returns {boolean} True if expired
   */
  isExpired(exp) {
    return time.isExpired(exp);
  },

  /**
   * Check if JWT is valid (not before time passed, not expired)
   * @param {Object} claims - JWT claims object
   * @returns {boolean} True if valid timing
   */
  isValid(claims) {
    const now = time.nowSeconds();

    if (claims.nbf && claims.nbf > now) {
      return false; // Not valid yet
    }

    if (claims.exp && claims.exp <= now) {
      return false; // Expired
    }

    return true;
  },
};
