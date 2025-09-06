import bcrypt from "bcryptjs";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

import { env } from "../lib/utils.mjs";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const table = env.getUsersTable() || "oidc-antonycc-com-prod-users";

const username = process.argv[2] || "test-user";
const password = process.argv[3] || "Passw0rd!";

console.log(`Provisioning user ${username} in table ${table}`);
const hash = bcrypt.hashSync(password, 10);
await ddb.send(new PutCommand({ TableName: table, Item: { username, passwordHash: hash, createdAt: Date.now() } }));
console.log("created", username);
