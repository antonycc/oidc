import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const table = process.env.USERS_TABLE;

const scan = await ddb.send(new ScanCommand({ TableName: table, ProjectionExpression: 'username' }));
for (const item of scan.Items ?? []) {
  await ddb.send(new DeleteCommand({ TableName: table, Key: { username: item.username } }));
  console.log('deleted', item.username);
}