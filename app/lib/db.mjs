import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
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
export const scan = (TableName) => ddb.send(new ScanCommand({ TableName }));
