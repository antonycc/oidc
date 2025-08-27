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
const isMem = (TableName) => typeof TableName === "string" && TableName.startsWith("mem_");
const memGetStore = (TableName) => {
  if (!memStores.has(TableName)) memStores.set(TableName, new Map());
  return memStores.get(TableName);
};
const keyString = (Key) => JSON.stringify(Key || {});
const inferKeyFromItem = (Item) => {
  if (!Item || typeof Item !== "object") return {};
  if (Item.code) return { code: Item.code };
  if (Item.username) return { username: Item.username };
  if (Item.id) return { id: Item.id };
  // Fallback to entire item (not ideal, but fine for tests)
  return Item;
};

export const put = (TableName, Item) => {
  if (isMem(TableName)) {
    const store = memGetStore(TableName);
    const Key = inferKeyFromItem(Item);
    store.set(keyString(Key), { ...Item });
    return Promise.resolve({});
  }
  return ddb.send(new PutCommand({ TableName, Item }));
};

export const get = (TableName, Key) => {
  if (isMem(TableName)) {
    const store = memGetStore(TableName);
    const Item = store.get(keyString(Key));
    return Promise.resolve({ Item });
  }
  return ddb.send(new GetCommand({ TableName, Key }));
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
  return ddb.send(
    new DeleteCommand({ TableName, Key, ConditionExpression, ExpressionAttributeValues })
  );
};
