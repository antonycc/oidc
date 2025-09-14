/**
 * Database abstraction layer for OIDC provider
 *
 * Provides a unified interface for DynamoDB operations with in-memory fallback
 * for testing and development. Supports both production DynamoDB and local
 * in-memory storage for unit tests.
 *
 * Table Structure:
 * - users: User accounts with password hashes
 * - codes: Authorization codes with PKCE data and TTL
 * - refresh: Refresh tokens (future use)
 *
 * In-memory mode: When table names start with "mem_", operations use
 * local Map storage instead of DynamoDB for testing.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  UpdateCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";

/**
 * DynamoDB document client for AWS operations
 * Automatically configured from environment credentials
 */
export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Table names resolved from environment variables
 * Set during Lambda deployment or local development
 */
export const tables = {
  users: process.env.USERS_TABLE,
  codes: process.env.CODES_TABLE,
  refresh: process.env.REFRESH_TABLE,
};

/**
 * In-memory storage for testing and local development
 * Used when table names have "mem_" prefix
 */
const memStores = new Map(); // Map<TableName, Map<string, any>>

/**
 * Check if table should use in-memory storage
 * @param {string} TableName - DynamoDB table name
 * @returns {boolean} True if table uses in-memory storage
 */
const isMem = (TableName) => typeof TableName === "string" && TableName.startsWith("mem_");

/**
 * Get or create in-memory store for a table
 * @param {string} TableName - Table name
 * @returns {Map} In-memory store for the table
 */
const memGetStore = (TableName) => {
  if (!memStores.has(TableName)) memStores.set(TableName, new Map());
  return memStores.get(TableName);
};

/**
 * Convert key object to string for in-memory storage indexing
 * @param {Object} Key - DynamoDB key object
 * @returns {string} Serialized key
 */
const keyString = (Key) => JSON.stringify(Key || {});

/**
 * Infer primary key from item data for in-memory operations
 * @param {Object} Item - DynamoDB item
 * @returns {Object} Inferred primary key
 */
const inferKeyFromItem = (Item) => {
  if (!Item || typeof Item !== "object") return {};
  if (Item.code) return { code: Item.code }; // Authorization codes table
  if (Item.username) return { username: Item.username }; // Users table
  if (Item.id) return { id: Item.id }; // Generic ID-based tables
  // Fallback to entire item (not ideal, but fine for tests)
  return Item;
};

/**
 * Store an item in DynamoDB or in-memory storage
 * @param {string} TableName - Target table name
 * @param {Object} Item - Item data to store
 * @returns {Promise<Object>} DynamoDB response or empty object for in-memory
 */
export const put = (TableName, Item) => {
  if (isMem(TableName)) {
    const store = memGetStore(TableName);
    const Key = inferKeyFromItem(Item);
    store.set(keyString(Key), { ...Item });
    return Promise.resolve({});
  }
  return ddb.send(new PutCommand({ TableName, Item }));
};

/**
 * Retrieve an item from DynamoDB or in-memory storage
 * @param {string} TableName - Source table name
 * @param {Object} Key - Primary key of item to retrieve
 * @returns {Promise<Object>} Item data or null if not found
 */
export const get = (TableName, Key) => {
  if (isMem(TableName)) {
    const store = memGetStore(TableName);
    const Item = store.get(keyString(Key));
    return Promise.resolve({ Item });
  }
  return ddb.send(new GetCommand({ TableName, Key, ConsistentRead: true }));
};

export const del = (TableName, Key) => {
  if (isMem(TableName)) {
    const store = memGetStore(TableName);
    store.delete(keyString(Key));
    return Promise.resolve({});
  }
  return ddb.send(new DeleteCommand({ TableName, Key }));
};

export const update = (TableName, params) => {
  if (isMem(TableName)) {
    const store = memGetStore(TableName);
    const Key = params.Key || {};
    const item = store.get(keyString(Key)) || {};
    const updated = { ...item, ...(params.Item || {}), ...(params.UpdateExpression ? {} : {}) };
    store.set(keyString(Key), updated);
    return Promise.resolve({});
  }
  return ddb.send(new UpdateCommand({ TableName, ...params }));
};

export const scan = (TableName) => {
  if (isMem(TableName)) {
    const store = memGetStore(TableName);
    return Promise.resolve({ Items: Array.from(store.values()) });
  }
  return ddb.send(new ScanCommand({ TableName }));
};

/**
 * Conditionally delete an item only if it exists and matches expected attributes
 * This ensures one-time use of authorization codes
 */
export const conditionalDelete = (TableName, Key, ConditionExpression, ExpressionAttributeValues = {}) => {
  if (isMem(TableName)) {
    const store = memGetStore(TableName);
    const has = store.has(keyString(Key));
    // Only supported condition used in code: attribute_exists(code)
    if (ConditionExpression && ConditionExpression.includes("attribute_exists") && !has) {
      const err = new Error("ConditionalCheckFailedException");
      err.name = "ConditionalCheckFailedException";
      return Promise.reject(err);
    }
    store.delete(keyString(Key));
    return Promise.resolve({});
  }
  const input = { TableName, Key, ConditionExpression };
  if (ExpressionAttributeValues && Object.keys(ExpressionAttributeValues).length > 0) {
    input.ExpressionAttributeValues = ExpressionAttributeValues;
  }
  return ddb.send(new DeleteCommand(input));
};
