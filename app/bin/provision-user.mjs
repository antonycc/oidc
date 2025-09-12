import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import bcrypt from "bcryptjs";
import { v4 } from "uuid";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const table = process.argv[2];
const username = process.argv[3] || v4();
const password = process.argv[4] || v4();

console.log(`Provisioning user ${username} in table ${table}`);
const hash = bcrypt.hashSync(password, 10);
await ddb.send(new PutCommand({ TableName: table, Item: { username, passwordHash: hash, createdAt: Date.now() } }));
console.log("created", username);
