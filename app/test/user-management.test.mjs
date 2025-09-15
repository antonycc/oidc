/**
 * User Management API tests
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { handler as userMgmt } from "../functions/user-management.mjs";

// Mock the database functions
vi.mock("../lib/db.mjs", () => ({
  put: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  conditionalDelete: vi.fn(),
  scan: vi.fn(),
  tables: {
    users: "test-users-table",
  },
}));

// Mock crypto functions
vi.mock("../lib/crypto.mjs", () => ({
  signJwt: vi.fn().mockResolvedValue("mock.jwt.token"),
  verifyJwt: vi.fn(),
}));

// Mock bcryptjs
vi.mock("bcryptjs", () => ({
  default: {
    hashSync: vi.fn((password, rounds) => `hash_${password}_${rounds}`),
    compareSync: vi.fn(),
  },
  hashSync: vi.fn((password, rounds) => `hash_${password}_${rounds}`),
  compareSync: vi.fn(),
}));

// Mock rate limiting
vi.mock("../lib/rate-limiting.mjs", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 49, resetTime: 0 }),
  recordAttempt: vi.fn(),
  getClientIp: vi.fn().mockReturnValue("192.168.1.1"),
}));

// Mock logging
vi.mock("../lib/utils.mjs", () => ({
  log: vi.fn(),
  logError: vi.fn(),
  createJsonResponse: (status, body, headers = {}) => ({
    statusCode: status,
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  }),
  parseFormBody: vi.fn((event) => {
    if (event.body) {
      const params = new URLSearchParams(event.body);
      return params;
    }
    return new URLSearchParams();
  }),
}));

import { put, get, conditionalDelete, scan } from "../lib/db.mjs";
import { verifyJwt } from "../lib/crypto.mjs";
import bcrypt from "bcryptjs";

describe("User Management API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /users - User Registration", () => {
    it("should create a new user with valid data", async () => {
      get.mockResolvedValue({ Item: null }); // User doesn't exist
      put.mockResolvedValue({});

      const event = {
        requestContext: { http: { method: "POST" } },
        rawPath: "/users",
        body: "username=testuser&password=TestPass123!&email=test@example.com&given_name=Test&family_name=User",
        headers: {},
      };

      const response = await userMgmt(event);

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.message).toBe("User created successfully");
      expect(body.user.username).toBe("testuser");
      expect(body.user.email).toBe("test@example.com");
      expect(body.user).not.toHaveProperty("passwordHash");
      expect(put).toHaveBeenCalledWith("test-users-table", expect.objectContaining({
        username: "testuser",
        email: "test@example.com",
        given_name: "Test",
        family_name: "User",
        role: "user",
        active: true,
      }));
    });

    it("should reject registration with missing required fields", async () => {
      const event = {
        requestContext: { http: { method: "POST" } },
        rawPath: "/users",
        body: "username=testuser&email=test@example.com", // Missing password
        headers: {},
      };

      const response = await userMgmt(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("invalid_request");
      expect(body.error_description).toContain("Missing required fields");
    });

    it("should reject registration with invalid username format", async () => {
      const event = {
        requestContext: { http: { method: "POST" } },
        rawPath: "/users",
        body: "username=ab&password=TestPass123!&email=test@example.com", // Too short
        headers: {},
      };

      const response = await userMgmt(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("invalid_request");
      expect(body.error_description).toContain("Username must be 3-30 characters");
    });

    it("should reject registration with weak password", async () => {
      const event = {
        requestContext: { http: { method: "POST" } },
        rawPath: "/users",
        body: "username=testuser&password=weak&email=test@example.com",
        headers: {},
      };

      const response = await userMgmt(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("invalid_request");
      expect(body.error_description).toBe("Password validation failed");
      expect(body.password_errors).toBeInstanceOf(Array);
    });

    it("should reject registration with invalid email", async () => {
      const event = {
        requestContext: { http: { method: "POST" } },
        rawPath: "/users",
        body: "username=testuser&password=TestPass123!&email=invalid-email",
        headers: {},
      };

      const response = await userMgmt(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("invalid_request");
      expect(body.error_description).toBe("Invalid email format");
    });

    it("should reject registration when username already exists", async () => {
      get.mockResolvedValue({ Item: { username: "testuser" } }); // User exists

      const event = {
        requestContext: { http: { method: "POST" } },
        rawPath: "/users",
        body: "username=testuser&password=TestPass123!&email=test@example.com",
        headers: {},
      };

      const response = await userMgmt(event);

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("user_exists");
    });
  });

  describe("GET /users/{username} - Get User Profile", () => {
    it("should allow user to access own profile", async () => {
      verifyJwt.mockResolvedValue({ sub: "testuser", role: "user" });
      get.mockResolvedValue({
        Item: {
          username: "testuser",
          email: "test@example.com",
          given_name: "Test",
          family_name: "User",
          passwordHash: "hashed_password",
        },
      });

      const event = {
        requestContext: { http: { method: "GET" } },
        rawPath: "/users/testuser",
        headers: { authorization: "Bearer valid_token" },
      };

      const response = await userMgmt(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.user.username).toBe("testuser");
      expect(body.user).not.toHaveProperty("passwordHash");
    });

    it("should allow admin to access any profile", async () => {
      verifyJwt.mockResolvedValue({ sub: "admin", role: "admin" });
      get.mockResolvedValue({
        Item: {
          username: "testuser",
          email: "test@example.com",
          passwordHash: "hashed_password",
        },
      });

      const event = {
        requestContext: { http: { method: "GET" } },
        rawPath: "/users/testuser",
        headers: { authorization: "Bearer admin_token" },
      };

      const response = await userMgmt(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.user.username).toBe("testuser");
    });

    it("should deny access to other users' profiles", async () => {
      verifyJwt.mockResolvedValue({ sub: "otheruser", role: "user" });

      const event = {
        requestContext: { http: { method: "GET" } },
        rawPath: "/users/testuser",
        headers: { authorization: "Bearer other_user_token" },
      };

      const response = await userMgmt(event);

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("access_denied");
    });

    it("should return 401 for missing authentication", async () => {
      const event = {
        requestContext: { http: { method: "GET" } },
        rawPath: "/users/testuser",
        headers: {},
      };

      const response = await userMgmt(event);

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("unauthorized");
    });

    it("should return 404 for non-existent user", async () => {
      verifyJwt.mockResolvedValue({ sub: "admin", role: "admin" });
      get.mockResolvedValue({ Item: null });

      const event = {
        requestContext: { http: { method: "GET" } },
        rawPath: "/users/nonexistent",
        headers: { authorization: "Bearer admin_token" },
      };

      const response = await userMgmt(event);

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("user_not_found");
    });
  });

  describe("PUT /users/{username} - Update User Profile", () => {
    it("should allow user to update own profile", async () => {
      verifyJwt.mockResolvedValue({ sub: "testuser", role: "user" });
      get.mockResolvedValue({
        Item: {
          username: "testuser",
          email: "old@example.com",
          given_name: "Old",
          family_name: "Name",
        },
      });
      put.mockResolvedValue({});

      const event = {
        requestContext: { http: { method: "PUT" } },
        rawPath: "/users/testuser",
        body: "email=new@example.com&given_name=New&family_name=Name",
        headers: { authorization: "Bearer user_token" },
      };

      const response = await userMgmt(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe("User profile updated successfully");
      expect(put).toHaveBeenCalledWith("test-users-table", expect.objectContaining({
        username: "testuser",
        email: "new@example.com",
        given_name: "New",
      }));
    });

    it("should prevent regular users from updating role", async () => {
      verifyJwt.mockResolvedValue({ sub: "testuser", role: "user" });
      get.mockResolvedValue({
        Item: {
          username: "testuser",
          email: "test@example.com",
          role: "user",
        },
      });
      put.mockResolvedValue({});

      const event = {
        requestContext: { http: { method: "PUT" } },
        rawPath: "/users/testuser",
        body: "role=admin", // Should be ignored
        headers: { authorization: "Bearer user_token" },
      };

      const response = await userMgmt(event);

      expect(response.statusCode).toBe(200);
      expect(put).toHaveBeenCalledWith("test-users-table", expect.objectContaining({
        role: "user", // Should remain unchanged
      }));
    });

    it("should allow admin to update any profile including role", async () => {
      verifyJwt.mockResolvedValue({ sub: "admin", role: "admin" });
      get.mockResolvedValue({
        Item: {
          username: "testuser",
          email: "test@example.com",
          role: "user",
        },
      });
      put.mockResolvedValue({});

      const event = {
        requestContext: { http: { method: "PUT" } },
        rawPath: "/users/testuser",
        body: "role=admin&email=admin@example.com",
        headers: { authorization: "Bearer admin_token" },
      };

      const response = await userMgmt(event);

      expect(response.statusCode).toBe(200);
      expect(put).toHaveBeenCalledWith("test-users-table", expect.objectContaining({
        role: "admin",
        email: "admin@example.com",
      }));
    });
  });

  describe("POST /users/{username}/password - Change Password", () => {
    it("should allow user to change own password", async () => {
      verifyJwt.mockResolvedValue({ sub: "testuser", role: "user" });
      get.mockResolvedValue({
        Item: {
          username: "testuser",
          passwordHash: "old_hash",
        },
      });
      bcrypt.compareSync.mockReturnValue(true);
      put.mockResolvedValue({});

      const event = {
        requestContext: { http: { method: "POST" } },
        rawPath: "/users/testuser/password",
        body: "current_password=OldPass123!&new_password=NewPass123!",
        headers: { authorization: "Bearer user_token" },
      };

      const response = await userMgmt(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe("Password changed successfully");
      expect(put).toHaveBeenCalledWith("test-users-table", expect.objectContaining({
        passwordHash: expect.stringContaining("hash_NewPass123!"),
      }));
    });

    it("should reject password change with incorrect current password", async () => {
      verifyJwt.mockResolvedValue({ sub: "testuser", role: "user" });
      get.mockResolvedValue({
        Item: {
          username: "testuser",
          passwordHash: "old_hash",
        },
      });
      bcrypt.compareSync.mockReturnValue(false);

      const event = {
        requestContext: { http: { method: "POST" } },
        rawPath: "/users/testuser/password",
        body: "current_password=WrongPass123!&new_password=NewPass123!",
        headers: { authorization: "Bearer user_token" },
      };

      const response = await userMgmt(event);

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("invalid_credentials");
    });

    it("should allow admin to change password without current password", async () => {
      verifyJwt.mockResolvedValue({ sub: "admin", role: "admin" });
      get.mockResolvedValue({
        Item: {
          username: "testuser",
          passwordHash: "old_hash",
        },
      });
      put.mockResolvedValue({});

      const event = {
        requestContext: { http: { method: "POST" } },
        rawPath: "/users/testuser/password",
        body: "new_password=NewPass123!",
        headers: { authorization: "Bearer admin_token" },
      };

      const response = await userMgmt(event);

      expect(response.statusCode).toBe(200);
      expect(put).toHaveBeenCalledWith("test-users-table", expect.objectContaining({
        passwordHash: expect.stringContaining("hash_NewPass123!"),
      }));
    });

    it("should reject weak new password", async () => {
      verifyJwt.mockResolvedValue({ sub: "testuser", role: "user" });

      const event = {
        requestContext: { http: { method: "POST" } },
        rawPath: "/users/testuser/password",
        body: "current_password=OldPass123!&new_password=weak",
        headers: { authorization: "Bearer user_token" },
      };

      const response = await userMgmt(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("invalid_request");
      expect(body.error_description).toBe("New password validation failed");
    });
  });

  describe("DELETE /users/{username} - Delete User", () => {
    it("should allow user to delete own account", async () => {
      verifyJwt.mockResolvedValue({ sub: "testuser", role: "user" });
      conditionalDelete.mockResolvedValue(true);

      const event = {
        requestContext: { http: { method: "DELETE" } },
        rawPath: "/users/testuser",
        headers: { authorization: "Bearer user_token" },
      };

      const response = await userMgmt(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.message).toBe("User account deleted successfully");
      expect(conditionalDelete).toHaveBeenCalledWith("test-users-table", { username: "testuser" });
    });

    it("should prevent admin from deleting their own account", async () => {
      verifyJwt.mockResolvedValue({ sub: "admin", role: "admin" });

      const event = {
        requestContext: { http: { method: "DELETE" } },
        rawPath: "/users/admin",
        headers: { authorization: "Bearer admin_token" },
      };

      const response = await userMgmt(event);

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error_description).toContain("Administrators cannot delete their own accounts");
    });

    it("should allow admin to delete other accounts", async () => {
      verifyJwt.mockResolvedValue({ sub: "admin", role: "admin" });
      conditionalDelete.mockResolvedValue(true);

      const event = {
        requestContext: { http: { method: "DELETE" } },
        rawPath: "/users/testuser",
        headers: { authorization: "Bearer admin_token" },
      };

      const response = await userMgmt(event);

      expect(response.statusCode).toBe(200);
      expect(conditionalDelete).toHaveBeenCalledWith("test-users-table", { username: "testuser" });
    });
  });

  describe("GET /users - List Users", () => {
    it("should allow admin to list all users", async () => {
      verifyJwt.mockResolvedValue({ sub: "admin", role: "admin" });
      scan.mockResolvedValue({
        Items: [
          { username: "user1", email: "user1@example.com", passwordHash: "hash1" },
          { username: "user2", email: "user2@example.com", passwordHash: "hash2" },
        ],
      });

      const event = {
        requestContext: { http: { method: "GET" } },
        rawPath: "/users",
        headers: { authorization: "Bearer admin_token" },
      };

      const response = await userMgmt(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.users).toHaveLength(2);
      expect(body.count).toBe(2);
      expect(body.users[0]).not.toHaveProperty("passwordHash");
      expect(body.users[1]).not.toHaveProperty("passwordHash");
    });

    it("should deny regular users from listing users", async () => {
      verifyJwt.mockResolvedValue({ sub: "user", role: "user" });

      const event = {
        requestContext: { http: { method: "GET" } },
        rawPath: "/users",
        headers: { authorization: "Bearer user_token" },
      };

      const response = await userMgmt(event);

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("access_denied");
    });
  });

  describe("Rate Limiting", () => {
    it("should apply rate limiting to user management requests", async () => {
      const { checkRateLimit, recordAttempt } = await import("../lib/rate-limiting.mjs");
      
      const event = {
        requestContext: { http: { method: "POST" } },
        rawPath: "/users",
        body: "username=testuser&password=TestPass123!&email=test@example.com",
        headers: {},
      };

      await userMgmt(event);

      expect(checkRateLimit).toHaveBeenCalledWith("userMgmt", "192.168.1.1");
      expect(recordAttempt).toHaveBeenCalledWith("userMgmt", "192.168.1.1", false);
    });
  });

  describe("Error Handling", () => {
    it("should return 404 for unknown endpoints", async () => {
      verifyJwt.mockResolvedValue({ sub: "user", role: "user" }); // Add auth to avoid 401
      
      const event = {
        requestContext: { http: { method: "GET" } },
        rawPath: "/unknown",
        headers: { authorization: "Bearer valid_token" },
      };

      const response = await userMgmt(event);

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("not_found");
    });

    it("should handle database errors gracefully", async () => {
      get.mockRejectedValue(new Error("Database connection failed"));

      const event = {
        requestContext: { http: { method: "POST" } },
        rawPath: "/users",
        body: "username=testuser&password=TestPass123!&email=test@example.com",
        headers: {},
      };

      const response = await userMgmt(event);

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe("server_error");
    });
  });
});