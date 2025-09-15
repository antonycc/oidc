/**
 * CloudWatch Metrics integration for OIDC provider monitoring
 * 
 * This module provides comprehensive metrics collection for:
 * - Authentication success/failure rates
 * - API endpoint performance
 * - Rate limiting events
 * - User management operations
 * - Token operations (introspection, revocation)
 * 
 * Metrics are sent to CloudWatch for dashboards, alarms, and monitoring
 */

import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";
import { log, logError } from "./utils.mjs";

// CloudWatch client
const cloudWatch = new CloudWatchClient({});

// Metrics configuration
const METRICS_CONFIG = {
  namespace: "OIDC/Provider",
  defaultDimensions: {
    Environment: process.env.ENVIRONMENT || "dev",
    Provider: "oidc-provider",
  },
  // Batch metrics for efficiency
  batchSize: 20,
  batchTimeout: 5000, // 5 seconds
};

// Metrics buffer for batching
let metricsBuffer = [];
let batchTimeout = null;

/**
 * Add a metric to the buffer and optionally flush
 * @param {Object} metric - CloudWatch metric object
 */
const addMetric = (metric) => {
  metricsBuffer.push(metric);
  
  // Schedule flush if not already scheduled
  if (!batchTimeout) {
    batchTimeout = setTimeout(flushMetrics, METRICS_CONFIG.batchTimeout);
  }
  
  // Flush immediately if buffer is full
  if (metricsBuffer.length >= METRICS_CONFIG.batchSize) {
    flushMetrics();
  }
};

/**
 * Flush metrics buffer to CloudWatch
 */
const flushMetrics = async () => {
  if (metricsBuffer.length === 0) {
    return;
  }
  
  const metrics = metricsBuffer.splice(0, METRICS_CONFIG.batchSize);
  if (batchTimeout) {
    clearTimeout(batchTimeout);
    batchTimeout = null;
  }
  
  try {
    const command = new PutMetricDataCommand({
      Namespace: METRICS_CONFIG.namespace,
      MetricData: metrics,
    });
    
    await cloudWatch.send(command);
    log("metrics_sent", `count_${metrics.length}`);
  } catch (error) {
    logError("metrics_send_failed", error);
    // Don't throw - metrics failures shouldn't break the application
  }
};

/**
 * Create a CloudWatch metric object
 * @param {string} metricName - Name of the metric
 * @param {number} value - Metric value
 * @param {string} unit - CloudWatch unit (Count, Seconds, etc.)
 * @param {Object} dimensions - Additional dimensions
 * @returns {Object} CloudWatch metric object
 */
const createMetric = (metricName, value, unit = "Count", dimensions = {}) => {
  return {
    MetricName: metricName,
    Value: value,
    Unit: unit,
    Timestamp: new Date(),
    Dimensions: Object.entries({
      ...METRICS_CONFIG.defaultDimensions,
      ...dimensions,
    }).map(([Name, Value]) => ({ Name, Value })),
  };
};

/**
 * Record authentication attempt metrics
 * @param {string} clientId - Client making the request
 * @param {string} result - 'success' or 'failure'
 * @param {string} reason - Failure reason if applicable
 * @param {number} duration - Request duration in milliseconds
 */
export const recordAuthMetrics = (clientId, result, reason = null, duration = null) => {
  // Skip metrics in test environment
  if (process.env.NODE_ENV === "test") {
    return;
  }
  
  const dimensions = { ClientId: clientId };
  
  // Authentication attempt count
  addMetric(createMetric("AuthenticationAttempts", 1, "Count", {
    ...dimensions,
    Result: result,
  }));
  
  // Success/failure specific metrics
  if (result === "success") {
    addMetric(createMetric("AuthenticationSuccess", 1, "Count", dimensions));
  } else {
    addMetric(createMetric("AuthenticationFailure", 1, "Count", {
      ...dimensions,
      Reason: reason || "unknown",
    }));
  }
  
  // Request duration if provided
  if (duration !== null) {
    addMetric(createMetric("AuthenticationDuration", duration, "Milliseconds", dimensions));
  }
};

/**
 * Record API endpoint metrics
 * @param {string} endpoint - Endpoint name (authorize, token, userinfo, etc.)
 * @param {string} method - HTTP method
 * @param {number} statusCode - HTTP status code
 * @param {number} duration - Request duration in milliseconds
 * @param {string} clientIp - Client IP for geographic analysis
 */
export const recordApiMetrics = (endpoint, method, statusCode, duration, clientIp = null) => {
  // Skip metrics in test environment
  if (process.env.NODE_ENV === "test") {
    return;
  }
  
  const dimensions = {
    Endpoint: endpoint,
    Method: method,
  };
  
  // Request count
  addMetric(createMetric("ApiRequests", 1, "Count", dimensions));
  
  // Status code metrics
  const statusCategory = Math.floor(statusCode / 100) * 100; // 200, 400, 500
  addMetric(createMetric("ApiResponses", 1, "Count", {
    ...dimensions,
    StatusCode: statusCategory.toString(),
  }));
  
  // Request duration
  addMetric(createMetric("ApiDuration", duration, "Milliseconds", dimensions));
  
  // Error tracking for 4xx and 5xx
  if (statusCode >= 400) {
    addMetric(createMetric("ApiErrors", 1, "Count", {
      ...dimensions,
      StatusCode: statusCode.toString(),
    }));
  }
};

/**
 * Record rate limiting metrics
 * @param {string} endpoint - Endpoint being rate limited
 * @param {string} clientIp - Client IP
 * @param {string} action - 'allowed', 'blocked', 'recorded'
 * @param {number} remaining - Remaining attempts
 */
export const recordRateLimitMetrics = (endpoint, clientIp, action, remaining = null) => {
  // Skip metrics in test environment
  if (process.env.NODE_ENV === "test") {
    return;
  }
  
  const dimensions = {
    Endpoint: endpoint,
    Action: action,
  };
  
  // Rate limit events
  addMetric(createMetric("RateLimitEvents", 1, "Count", dimensions));
  
  // Blocked requests specifically
  if (action === "blocked") {
    addMetric(createMetric("RateLimitBlocked", 1, "Count", { Endpoint: endpoint }));
  }
  
  // Remaining capacity if provided
  if (remaining !== null) {
    addMetric(createMetric("RateLimitRemaining", remaining, "Count", { Endpoint: endpoint }));
  }
};

/**
 * Record user management operation metrics
 * @param {string} operation - Operation type (create, update, delete, etc.)
 * @param {string} result - 'success' or 'failure'
 * @param {string} userRole - Role of user performing operation
 * @param {string} targetRole - Role of target user (for admin operations)
 */
export const recordUserMgmtMetrics = (operation, result, userRole, targetRole = null) => {
  // Skip metrics in test environment
  if (process.env.NODE_ENV === "test") {
    return;
  }
  
  const dimensions = {
    Operation: operation,
    Result: result,
    UserRole: userRole,
  };
  
  if (targetRole) {
    dimensions.TargetRole = targetRole;
  }
  
  // User management operations
  addMetric(createMetric("UserMgmtOperations", 1, "Count", dimensions));
  
  // Track admin operations separately
  if (userRole === "admin") {
    addMetric(createMetric("AdminOperations", 1, "Count", {
      Operation: operation,
      Result: result,
    }));
  }
};

/**
 * Record token operation metrics
 * @param {string} operation - Operation type (introspect, revoke)
 * @param {string} tokenType - Token type (access_token, refresh_token)
 * @param {string} result - 'success' or 'failure'
 * @param {string} clientId - Client performing operation
 * @param {number} duration - Operation duration in milliseconds
 */
export const recordTokenMetrics = (operation, tokenType, result, clientId, duration = null) => {
  // Skip metrics in test environment
  if (process.env.NODE_ENV === "test") {
    return;
  }
  
  const dimensions = {
    Operation: operation,
    TokenType: tokenType,
    Result: result,
    ClientId: clientId,
  };
  
  // Token operations
  addMetric(createMetric("TokenOperations", 1, "Count", dimensions));
  
  // Operation duration if provided
  if (duration !== null) {
    addMetric(createMetric("TokenOperationDuration", duration, "Milliseconds", {
      Operation: operation,
      ClientId: clientId,
    }));
  }
};

/**
 * Record system health metrics
 * @param {string} component - Component name (database, crypto, etc.)
 * @param {string} status - Health status (healthy, degraded, error)
 * @param {number} responseTime - Response time in milliseconds
 */
export const recordHealthMetrics = (component, status, responseTime = null) => {
  // Skip metrics in test environment
  if (process.env.NODE_ENV === "test") {
    return;
  }
  
  const dimensions = {
    Component: component,
    Status: status,
  };
  
  // Health status
  addMetric(createMetric("ComponentHealth", 1, "Count", dimensions));
  
  // Response time if provided
  if (responseTime !== null) {
    addMetric(createMetric("ComponentResponseTime", responseTime, "Milliseconds", {
      Component: component,
    }));
  }
};

/**
 * Record custom business metrics
 * @param {string} metricName - Custom metric name
 * @param {number} value - Metric value
 * @param {string} unit - CloudWatch unit
 * @param {Object} dimensions - Custom dimensions
 */
export const recordCustomMetric = (metricName, value, unit = "Count", dimensions = {}) => {
  // Skip metrics in test environment
  if (process.env.NODE_ENV === "test") {
    return;
  }
  
  addMetric(createMetric(metricName, value, unit, dimensions));
};

/**
 * Middleware function to automatically record API metrics
 * @param {string} endpoint - Endpoint name
 * @returns {Function} Middleware function
 */
export const metricsMiddleware = (endpoint) => {
  return async (event, next) => {
    const startTime = Date.now();
    const method = event.requestContext?.http?.method || "UNKNOWN";
    const clientIp = event.requestContext?.http?.sourceIp || "unknown";
    
    try {
      const response = await next(event);
      const duration = Date.now() - startTime;
      const statusCode = response?.statusCode || 200;
      
      recordApiMetrics(endpoint, method, statusCode, duration, clientIp);
      
      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      recordApiMetrics(endpoint, method, 500, duration, clientIp);
      throw error;
    }
  };
};

/**
 * Ensure all buffered metrics are sent (useful for Lambda cleanup)
 */
export const flushAllMetrics = async () => {
  while (metricsBuffer.length > 0) {
    await flushMetrics();
  }
};

/**
 * Get current metrics buffer status (for monitoring)
 */
export const getMetricsStatus = () => {
  return {
    bufferSize: metricsBuffer.length,
    maxBufferSize: METRICS_CONFIG.batchSize,
    batchTimeoutActive: !!batchTimeout,
  };
};