/**
 * User Management API endpoint handler
 * Provides REST API for user registration, profile management, and administration
 * 
 * Endpoints:
 * POST /users - Create new user account
 * GET /users/{username} - Get user profile (authenticated)
 * PUT /users/{username} - Update user profile (authenticated)
 * DELETE /users/{username} - Delete user account (authenticated)
 * GET /users - List users (admin only)
 * POST /users/{username}/password - Change password
 */

import { ulid } from "ulid";
import { put, get, update, conditionalDelete, scan, tables } from "../lib/db.mjs";
import bcrypt from "bcryptjs";
import { log, logError, createJsonResponse, parseFormBody } from "../lib/utils.mjs";
import { checkRateLimit, recordAttempt, getClientIp } from "../lib/rate-limiting.mjs";
import { signJwt, verifyJwt } from "../lib/crypto.mjs";

// User management configuration
const USER_MGMT_CONFIG = {
  // Default user profile fields
  defaultFields: ["username", "email", "given_name", "family_name", "picture"],
  // Admin roles
  adminRoles: ["admin", "user_admin"],
  // Password requirements
  passwordMinLength: 8,
  passwordRequireSpecialChar: true,
  passwordRequireNumber: true,
  passwordRequireUppercase: true,
};

/**
 * Extract user ID and role from authentication header
 * @param {Object} headers - Request headers
 * @returns {Promise<{userId: string, role: string} | null>}
 */
const authenticateRequest = async (headers) => {
  const authHeader = headers?.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  try {
    const token = authHeader.substring(7);
    const payload = await verifyJwt(token);
    
    return {
      userId: payload.sub,
      role: payload.role || "user",
      scopes: payload.scope?.split(" ") || [],
    };
  } catch (error) {
    logError("auth_token_verification_failed", error);
    return null;
  }
};

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {{valid: boolean, errors: string[]}}
 */
const validatePassword = (password) => {
  const errors = [];
  
  if (!password || password.length < USER_MGMT_CONFIG.passwordMinLength) {
    errors.push(`Password must be at least ${USER_MGMT_CONFIG.passwordMinLength} characters long`);
  }
  
  if (USER_MGMT_CONFIG.passwordRequireSpecialChar && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push("Password must contain at least one special character");
  }
  
  if (USER_MGMT_CONFIG.passwordRequireNumber && !/\d/.test(password)) {
    errors.push("Password must contain at least one number");
  }
  
  if (USER_MGMT_CONFIG.passwordRequireUppercase && !/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean}
 */
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Sanitize user data for response (remove sensitive fields)
 * @param {Object} user - User object
 * @returns {Object} Sanitized user object
 */
const sanitizeUserForResponse = (user) => {
  const { passwordHash, ...sanitizedUser } = user;
  return sanitizedUser;
};

/**
 * Create new user account
 * @param {Object} event - Lambda event
 * @returns {Promise<Object>} Response object
 */
const createUser = async (event) => {
  const body = parseFormBody(event);
  const userData = Object.fromEntries(body.entries());
  
  const { username, password, email, given_name, family_name, picture } = userData;
  
  // Validate required fields
  if (!username || !password || !email) {
    return createJsonResponse(400, {
      error: "invalid_request",
      error_description: "Missing required fields: username, password, email",
    });
  }
  
  // Validate username format (alphanumeric, underscore, hyphen)
  if (!/^[a-zA-Z0-9_-]{3,30}$/.test(username)) {
    return createJsonResponse(400, {
      error: "invalid_request",
      error_description: "Username must be 3-30 characters, alphanumeric with underscore or hyphen",
    });
  }
  
  // Validate email format
  if (!validateEmail(email)) {
    return createJsonResponse(400, {
      error: "invalid_request", 
      error_description: "Invalid email format",
    });
  }
  
  // Validate password strength
  const passwordValidation = validatePassword(password);
  if (!passwordValidation.valid) {
    return createJsonResponse(400, {
      error: "invalid_request",
      error_description: "Password validation failed",
      password_errors: passwordValidation.errors,
    });
  }
  
  // Check if username already exists
  try {
    const existingUser = await get(tables.users, { username });
    if (existingUser?.Item) {
      return createJsonResponse(409, {
        error: "user_exists",
        error_description: "Username already exists",
      });
    }
  } catch (error) {
    logError("user_existence_check_failed", username, error);
    return createJsonResponse(500, { error: "server_error" });
  }
  
  // Hash password
  const passwordHash = bcrypt.hashSync(password, 12);
  
  // Create user record
  const user = {
    username,
    passwordHash,
    email,
    given_name: given_name || "",
    family_name: family_name || "",
    picture: picture || "",
    role: "user",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    email_verified: false,
    active: true,
    user_id: ulid(),
  };
  
  try {
    await put(tables.users, user);
    log("user_created", username, email);
    
    // Return sanitized user data
    return createJsonResponse(201, {
      message: "User created successfully",
      user: sanitizeUserForResponse(user),
    });
  } catch (error) {
    logError("user_creation_failed", username, error);
    return createJsonResponse(500, { error: "server_error" });
  }
};

/**
 * Get user profile
 * @param {Object} event - Lambda event
 * @param {string} targetUsername - Username to retrieve
 * @param {Object} auth - Authentication context
 * @returns {Promise<Object>} Response object
 */
const getUser = async (event, targetUsername, auth) => {
  // Users can access their own profile, admins can access any profile
  const isOwnProfile = auth.userId === targetUsername;
  const isAdmin = USER_MGMT_CONFIG.adminRoles.includes(auth.role);
  
  if (!isOwnProfile && !isAdmin) {
    return createJsonResponse(403, {
      error: "access_denied",
      error_description: "Insufficient privileges to access this user profile",
    });
  }
  
  try {
    const result = await get(tables.users, { username: targetUsername });
    if (!result?.Item) {
      return createJsonResponse(404, {
        error: "user_not_found",
        error_description: "User does not exist",
      });
    }
    
    log("user_profile_accessed", targetUsername, auth.userId);
    return createJsonResponse(200, {
      user: sanitizeUserForResponse(result.Item),
    });
  } catch (error) {
    logError("user_profile_access_failed", targetUsername, error);
    return createJsonResponse(500, { error: "server_error" });
  }
};

/**
 * Update user profile
 * @param {Object} event - Lambda event
 * @param {string} targetUsername - Username to update
 * @param {Object} auth - Authentication context
 * @returns {Promise<Object>} Response object
 */
const updateUser = async (event, targetUsername, auth) => {
  // Users can update their own profile, admins can update any profile
  const isOwnProfile = auth.userId === targetUsername;
  const isAdmin = USER_MGMT_CONFIG.adminRoles.includes(auth.role);
  
  if (!isOwnProfile && !isAdmin) {
    return createJsonResponse(403, {
      error: "access_denied",
      error_description: "Insufficient privileges to update this user profile",
    });
  }
  
  const body = parseFormBody(event);
  const updates = Object.fromEntries(body.entries());
  
  // Remove fields that shouldn't be updated via this endpoint
  const forbiddenFields = ["username", "passwordHash", "user_id", "created_at"];
  forbiddenFields.forEach(field => delete updates[field]);
  
  // Only admins can update role
  if (updates.role && !isAdmin) {
    delete updates.role;
  }
  
  // Validate email if provided
  if (updates.email && !validateEmail(updates.email)) {
    return createJsonResponse(400, {
      error: "invalid_request",
      error_description: "Invalid email format",
    });
  }
  
  // Add updated timestamp
  updates.updated_at = new Date().toISOString();
  
  try {
    // Check if user exists
    const result = await get(tables.users, { username: targetUsername });
    if (!result?.Item) {
      return createJsonResponse(404, {
        error: "user_not_found",
        error_description: "User does not exist",
      });
    }
    
    // Update user
    const updatedUser = { ...result.Item, ...updates };
    await put(tables.users, updatedUser);
    
    log("user_profile_updated", targetUsername, auth.userId, Object.keys(updates));
    return createJsonResponse(200, {
      message: "User profile updated successfully",
      user: sanitizeUserForResponse(updatedUser),
    });
  } catch (error) {
    logError("user_profile_update_failed", targetUsername, error);
    return createJsonResponse(500, { error: "server_error" });
  }
};

/**
 * Delete user account
 * @param {Object} event - Lambda event
 * @param {string} targetUsername - Username to delete
 * @param {Object} auth - Authentication context
 * @returns {Promise<Object>} Response object
 */
const deleteUser = async (event, targetUsername, auth) => {
  // Users can delete their own account, admins can delete any account
  const isOwnProfile = auth.userId === targetUsername;
  const isAdmin = USER_MGMT_CONFIG.adminRoles.includes(auth.role);
  
  if (!isOwnProfile && !isAdmin) {
    return createJsonResponse(403, {
      error: "access_denied",
      error_description: "Insufficient privileges to delete this user account",
    });
  }
  
  // Prevent admins from deleting themselves (safety measure)
  if (isOwnProfile && isAdmin) {
    return createJsonResponse(400, {
      error: "invalid_request", 
      error_description: "Administrators cannot delete their own accounts",
    });
  }
  
  try {
    const result = await conditionalDelete(tables.users, { username: targetUsername });
    if (!result) {
      return createJsonResponse(404, {
        error: "user_not_found",
        error_description: "User does not exist",
      });
    }
    
    log("user_account_deleted", targetUsername, auth.userId);
    return createJsonResponse(200, {
      message: "User account deleted successfully",
    });
  } catch (error) {
    logError("user_account_deletion_failed", targetUsername, error);
    return createJsonResponse(500, { error: "server_error" });
  }
};

/**
 * List users (admin only)
 * @param {Object} event - Lambda event
 * @param {Object} auth - Authentication context
 * @returns {Promise<Object>} Response object
 */
const listUsers = async (event, auth) => {
  if (!USER_MGMT_CONFIG.adminRoles.includes(auth.role)) {
    return createJsonResponse(403, {
      error: "access_denied",
      error_description: "Insufficient privileges to list users",
    });
  }
  
  try {
    const result = await scan(tables.users);
    const users = result.Items?.map(sanitizeUserForResponse) || [];
    
    log("users_listed", auth.userId, `count_${users.length}`);
    return createJsonResponse(200, {
      users,
      count: users.length,
    });
  } catch (error) {
    logError("users_list_failed", auth.userId, error);
    return createJsonResponse(500, { error: "server_error" });
  }
};

/**
 * Change user password
 * @param {Object} event - Lambda event
 * @param {string} targetUsername - Username for password change
 * @param {Object} auth - Authentication context
 * @returns {Promise<Object>} Response object
 */
const changePassword = async (event, targetUsername, auth) => {
  // Users can change their own password, admins can change any password
  const isOwnProfile = auth.userId === targetUsername;
  const isAdmin = USER_MGMT_CONFIG.adminRoles.includes(auth.role);
  
  if (!isOwnProfile && !isAdmin) {
    return createJsonResponse(403, {
      error: "access_denied",
      error_description: "Insufficient privileges to change this user's password",
    });
  }
  
  const body = parseFormBody(event);
  const { current_password, new_password } = Object.fromEntries(body.entries());
  
  if (!new_password) {
    return createJsonResponse(400, {
      error: "invalid_request",
      error_description: "Missing required field: new_password",
    });
  }
  
  // Validate new password strength
  const passwordValidation = validatePassword(new_password);
  if (!passwordValidation.valid) {
    return createJsonResponse(400, {
      error: "invalid_request",
      error_description: "New password validation failed",
      password_errors: passwordValidation.errors,
    });
  }
  
  try {
    const result = await get(tables.users, { username: targetUsername });
    if (!result?.Item) {
      return createJsonResponse(404, {
        error: "user_not_found",
        error_description: "User does not exist",
      });
    }
    
    const user = result.Item;
    
    // If not admin, verify current password
    if (!isAdmin && isOwnProfile) {
      if (!current_password) {
        return createJsonResponse(400, {
          error: "invalid_request",
          error_description: "Current password required",
        });
      }
      
      if (!bcrypt.compareSync(current_password, user.passwordHash)) {
        return createJsonResponse(401, {
          error: "invalid_credentials",
          error_description: "Current password is incorrect",
        });
      }
    }
    
    // Hash new password
    const newPasswordHash = bcrypt.hashSync(new_password, 12);
    
    // Update password
    const updatedUser = {
      ...user,
      passwordHash: newPasswordHash,
      updated_at: new Date().toISOString(),
    };
    
    await put(tables.users, updatedUser);
    
    log("user_password_changed", targetUsername, auth.userId);
    return createJsonResponse(200, {
      message: "Password changed successfully",
    });
  } catch (error) {
    logError("password_change_failed", targetUsername, error);
    return createJsonResponse(500, { error: "server_error" });
  }
};

/**
 * User Management API handler
 * Routes requests to appropriate user management functions
 * 
 * @param {Object} event - Lambda event object
 * @returns {Promise<Object>} Lambda response object
 */
export const handler = async (event) => {
  try {
    const method = event.requestContext?.http?.method;
    const path = event.rawPath || "";
    const pathParts = path.split("/").filter(Boolean);
    
    // Apply rate limiting
    const clientIp = getClientIp(event);
    const rateLimitResult = await checkRateLimit("userMgmt", clientIp);
    
    if (!rateLimitResult.allowed) {
      const retryAfter = rateLimitResult.resetTime - Math.floor(Date.now() / 1000);
      return createJsonResponse(429, {
        error: "rate_limit_exceeded",
        error_description: "Too many user management requests. Please try again later.",
        retry_after: retryAfter,
      }, {
        "Retry-After": retryAfter.toString(),
        "X-RateLimit-Limit": "50",
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": rateLimitResult.resetTime.toString(),
      });
    }
    
    // Record the attempt
    await recordAttempt("userMgmt", clientIp, false);
    
    log("user_mgmt_request", method, path, clientIp);
    
    // Route based on method and path
    if (method === "POST" && pathParts.length === 1 && pathParts[0] === "users") {
      // POST /users - Create user (no auth required for registration)
      return await createUser(event);
    }
    
    // All other endpoints require authentication
    const auth = await authenticateRequest(event.headers);
    if (!auth) {
      return createJsonResponse(401, {
        error: "unauthorized",
        error_description: "Valid bearer token required",
      });
    }
    
    if (method === "GET" && pathParts.length === 1 && pathParts[0] === "users") {
      // GET /users - List users (admin only)
      return await listUsers(event, auth);
    }
    
    if (pathParts.length === 2 && pathParts[0] === "users") {
      const username = pathParts[1];
      
      if (method === "GET") {
        // GET /users/{username} - Get user profile
        return await getUser(event, username, auth);
      } else if (method === "PUT") {
        // PUT /users/{username} - Update user profile
        return await updateUser(event, username, auth);
      } else if (method === "DELETE") {
        // DELETE /users/{username} - Delete user
        return await deleteUser(event, username, auth);
      }
    }
    
    if (pathParts.length === 3 && pathParts[0] === "users" && pathParts[2] === "password") {
      const username = pathParts[1];
      
      if (method === "POST") {
        // POST /users/{username}/password - Change password
        return await changePassword(event, username, auth);
      }
    }
    
    // If we get here, the endpoint wasn't found
    return createJsonResponse(404, {
      error: "not_found",
      error_description: "User management endpoint not found",
    });
    
  } catch (error) {
    logError("user_mgmt_error", error);
    return createJsonResponse(500, { error: "server_error" });
  }
};