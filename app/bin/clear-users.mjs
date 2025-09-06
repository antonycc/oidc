import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, DeleteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

import { env } from "../lib/utils.mjs";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const table = env.getUsersTable() || "oidc-antonycc-com-prod-users";

const scan = await ddb.send(new ScanCommand({ TableName: table, ProjectionExpression: "username" }));
for (const item of scan.Items ?? []) {
  await ddb.send(new DeleteCommand({ TableName: table, Key: { username: item.username } }));
  console.log("deleted", item.username);
}
