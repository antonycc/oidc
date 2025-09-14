#!/usr/bin/env node

/**
 * User Provisioning Script for OIDC Provider
 *
 * Creates user accounts in the DynamoDB users table with bcrypt-hashed passwords.
 * Used for testing and initial user setup in deployed environments.
 *
 * Usage:
 *   node provision-user.mjs <table-name> [username] [password]
 *
 * Parameters:
 *   table-name: DynamoDB table name (required)
 *   username: User identifier (optional, generates UUID if not provided)
 *   password: User password (optional, generates UUID if not provided)
 *
 * Examples:
 *   # Create user with generated credentials
 *   node provision-user.mjs oidc-ci-users
 *
 *   # Create specific user
 *   node provision-user.mjs oidc-ci-users test-user my-password
 *
 *   # Used in GitHub Actions
 *   node provision-user.mjs ${{ env.USERS_TABLE }} test-user ${{ env.TEST_PASSWORD }}
 *
 * Environment:
 *   Requires AWS credentials with DynamoDB:PutItem permission on target table
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import bcrypt from "bcryptjs";
import { v4 } from "uuid";

// Initialize DynamoDB client with default AWS credentials
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// Parse command line arguments
const table = process.argv[2];
const username = process.argv[3] || v4();
const password = process.argv[4] || v4();

// Validate required arguments
if (!table) {
  console.error("Error: Table name is required");
  console.error("Usage: node provision-user.mjs <table-name> [username] [password]");
  process.exit(1);
}

console.log(`Provisioning user ${username} in table ${table}`);

try {
  // Hash password using bcrypt (cost factor 10 for balance of security and performance)
  const hash = bcrypt.hashSync(password, 10);

  // Create user record in DynamoDB
  await ddb.send(
    new PutCommand({
      TableName: table,
      Item: {
        username,
        passwordHash: hash,
        createdAt: Date.now(),
        // Additional user attributes can be added here
        email: `${username}@example.com`,
        name: username.replace(/[-_]/g, " "),
        emailVerified: true,
      },
    }),
  );

  console.log("✓ User created successfully:", username);

  // Output credentials for testing (only show generated passwords)
  if (process.argv[4] === undefined) {
    console.log("Generated password:", password);
  }
} catch (error) {
  console.error("✗ Failed to create user:", error.message);
  process.exit(1);
}
