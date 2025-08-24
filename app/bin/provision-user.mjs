import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import bcrypt from "bcryptjs";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const table = process.env.USERS_TABLE;

const username = process.argv[2] || "test-user";
const password = process.argv[3] || "Passw0rd!";

const hash = bcrypt.hashSync(password, 10);
await ddb.send(new PutCommand({ TableName: table, Item: { username, passwordHash: hash, createdAt: Date.now() } }));
console.log("created", username);
