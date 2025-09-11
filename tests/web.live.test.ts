import { test, expect } from "@playwright/test";
import { generateTestCredentialsForTest } from "../app/lib/credential-generator.mjs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

// use dotenv variables for sensitive info
import * as dotenv from "dotenv";
dotenv.config();

const DOMAIN_NAME = process.env.DOMAIN_NAME || "oidc.antonycc.com";
const BASE_URL = process.env.BASE_URL || `https://${DOMAIN_NAME}`;

// @ts-ignore
test("Home renders", async ({ page }) => {
  await page.goto(new URL("/", BASE_URL).toString());
  await expect(page.getByRole("heading", { name: "OIDC - Home" })).toBeVisible();
});

// @ts-ignore
test("Direct login form: failed login shows error", async ({ page }) => {
  // Generate test credentials
  const testCredentials = generateTestCredentialsForTest("web-test-fail");
  
  await page.goto(new URL("./loginDirect.html", BASE_URL).toString());
  await page.getByRole("heading", { name: "OIDC - Direct Login" }).waitFor();
  await page.getByLabel("Username").fill(testCredentials.username);
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid username or password")).toBeVisible();
});

// @ts-ignore
test("Direct login form: successful login returns tokens and claims", async ({ page }) => {
  // Generate test credentials for this test
  const testCredentials = generateTestCredentialsForTest("web-test-success");
  
  // Provision the test user in DynamoDB if running against a live deployment
  const USERS_TABLE = process.env.USERS_TABLE;
  let ddbClient = null;
  let ddb = null;
  
  if (USERS_TABLE) {
    ddbClient = new DynamoDBClient({});
    ddb = DynamoDBDocumentClient.from(ddbClient);
    
    // Provision test user
    await ddb.send(
      new PutCommand({
        TableName: USERS_TABLE,
        Item: {
          username: testCredentials.username,
          passwordHash: testCredentials.passwordHash,
          email: testCredentials.email,
          name: testCredentials.name,
          given_name: testCredentials.given_name,
          family_name: testCredentials.family_name,
          createdAt: Date.now(),
        },
      }),
    );
  }

  try {
    await page.goto(new URL("./loginDirect.html", BASE_URL).toString());
    await page.getByRole("heading", { name: "OIDC - Direct Login" }).waitFor();
    await page.getByLabel("Username").fill(testCredentials.username);
    await page.getByLabel("Password").fill(testCredentials.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/post-auth\.html\?code=/, { timeout: 20000 });
    await expect(page.getByText("Summary: Authorization code exchanged for tokens, user info retrieved")).toBeVisible();
    await expect(page.getByText("User is now authenticated and logged in")).toBeVisible();
  } finally {
    // Cleanup: Remove test user if we created it
    if (ddb && USERS_TABLE) {
      try {
        await ddb.send(
          new DeleteCommand({
            TableName: USERS_TABLE,
            Key: { username: testCredentials.username },
          }),
        );
      } catch (error) {
        console.warn("Failed to cleanup test user:", error);
      }
    }
  }
});
