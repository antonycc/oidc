#!/usr/bin/env node

/**
 * User Cleanup Script for OIDC Provider
 *
 * Removes all user accounts from the DynamoDB users table.
 * Used for cleanup after testing or for resetting user state.
 *
 * Usage:
 *   node clear-users.mjs [table-name]
 *
 * Parameters:
 *   table-name: DynamoDB table name (optional, defaults to production table)
 *
 * Examples:
 *   # Clear production users table
 *   node clear-users.mjs
 *
 *   # Clear specific table
 *   node clear-users.mjs oidc-ci-users
 *
 *   # Clear CI users via environment variable
 *   USERS_TABLE=oidc-ci-users node clear-users.mjs
 *
 * WARNING: This operation is irreversible. Use with caution in production.
 *
 * Environment:
 *   Requires AWS credentials with DynamoDB:Scan and DynamoDB:DeleteItem permissions
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

// Initialize DynamoDB client with default AWS credentials
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// Determine target table (command line, environment, or default)
const table = process.argv[2] || process.env.USERS_TABLE || "oidc-antonycc-com-prod-users";

console.log(`🗑️  Clearing all users from table: ${table}`);

// Confirm operation for production table
if (table.includes("-prod-") && !process.env.CI && !process.argv[3]) {
  console.log("⚠️  This appears to be a production table!");
  console.log("   Add 'confirm' as third argument to proceed");
  console.log("   Example: node clear-users.mjs", table, "confirm");
  process.exit(1);
}

try {
  // Scan table to get all user records (only username for efficiency)
  console.log("📋 Scanning for users...");
  const scan = await ddb.send(
    new ScanCommand({
      TableName: table,
      ProjectionExpression: "username",
    }),
  );

  const userCount = scan.Items?.length || 0;
  console.log(`Found ${userCount} users to delete`);

  if (userCount === 0) {
    console.log("✓ Table is already empty");
    process.exit(0);
  }

  // Delete each user individually
  let deletedCount = 0;
  for (const item of scan.Items ?? []) {
    try {
      await ddb.send(
        new DeleteCommand({
          TableName: table,
          Key: { username: item.username },
        }),
      );
      deletedCount++;
      console.log(`✓ Deleted user: ${item.username}`);
    } catch (error) {
      console.error(`✗ Failed to delete ${item.username}:`, error.message);
    }
  }

  console.log(`🎉 Cleanup complete: ${deletedCount}/${userCount} users deleted`);
} catch (error) {
  console.error("✗ Failed to clear users:", error.message);

  if (error.name === "ResourceNotFoundException") {
    console.error("   Table does not exist:", table);
  } else if (error.name === "AccessDeniedException") {
    console.error("   Insufficient permissions for table:", table);
  }

  process.exit(1);
}
