/**
 * DynamoDB abstraction layer for OIDC provider
 * Provides both DynamoDB and in-memory storage for testing
 * Table names prefixed with "mem_" use in-memory storage
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

// DynamoDB client (used when not in memory mode)
export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// Table names from env
export const tables = {
  users: process.env.USERS_TABLE,
  codes: process.env.CODES_TABLE,
  refresh: process.env.REFRESH_TABLE,
};

// Simple in-memory store for local/system tests when TableName starts with "mem_"
const memStores = new Map(); // Map<TableName, Map<string, any>>

/**
 * Check if table should use in-memory storage (for testing)
 * @param {string} TableName - DynamoDB table name
 * @returns {boolean} True if table should use memory storage
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
 * Convert key object to string for in-memory storage
 * @param {object} Key - DynamoDB key object
 * @returns {string} String representation of key
 */
const keyString = (Key) => JSON.stringify(Key || {});

/**
 * Infer primary key from item for in-memory storage
 * @param {object} Item - DynamoDB item
 * @returns {object} Inferred key object
 */
const inferKeyFromItem = (Item) => {
  if (!Item || typeof Item !== "object") return {};
  if (Item.code) return { code: Item.code };
  if (Item.username) return { username: Item.username };
  if (Item.id) return { id: Item.id };
  // Fallback to entire item (not ideal, but fine for tests)
  return Item;
};

/**
 * Put an item into DynamoDB table or memory store
 * @param {string} TableName - Table name
 * @param {object} Item - Item to store
 * @returns {Promise<object>} DynamoDB response or empty object for memory
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
 * Get an item from DynamoDB table or memory store
 * @param {string} TableName - Table name
 * @param {object} Key - Primary key of item to retrieve
 * @returns {Promise<object>} DynamoDB response with Item property
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
