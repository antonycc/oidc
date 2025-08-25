import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  UpdateCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
export const tables = {
  users: process.env.USERS_TABLE,
  codes: process.env.CODES_TABLE,
  refresh: process.env.REFRESH_TABLE,
};

export const put = (TableName, Item) => ddb.send(new PutCommand({ TableName, Item }));
export const get = (TableName, Key) => ddb.send(new GetCommand({ TableName, Key }));
export const del = (TableName, Key) => ddb.send(new DeleteCommand({ TableName, Key }));
export const update = (TableName, params) => ddb.send(new UpdateCommand({ TableName, ...params }));
export const scan = (TableName) => ddb.send(new ScanCommand({ TableName }));

/**
 * Conditionally delete an item only if it exists and matches expected attributes
 * This ensures one-time use of authorization codes
 */
export const conditionalDelete = (TableName, Key, ConditionExpression, ExpressionAttributeValues = {}) => 
  ddb.send(new DeleteCommand({ 
    TableName, 
    Key, 
    ConditionExpression,
    ExpressionAttributeValues
  }));
