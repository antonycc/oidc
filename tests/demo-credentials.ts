import { request } from "@playwright/test";

export interface DemoCredentials {
  TEST_USERNAME: string;
  TEST_PASSWORD: string;
}

/**
 * Fetches demo credentials from the deployed website's .env.demo file
 * @param baseUrl The base URL of the deployed service
 * @returns Promise resolving to credentials object
 */
export async function fetchDemoCredentials(baseUrl: string): Promise<DemoCredentials> {
  const ctx = await request.newContext();

  try {
    const response = await ctx.get(`${baseUrl}/.env.demo`);

    if (!response.ok()) {
      throw new Error(`Failed to fetch demo credentials: ${response.status()} ${response.statusText()}`);
    }

    const envContent = await response.text();

    // Parse the .env content
    const credentials: Partial<DemoCredentials> = {};

    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const [key, ...valueParts] = trimmed.split("=");
      const value = valueParts.join("="); // Handle values with = in them

      if (key === "TEST_USERNAME" || key === "TEST_PASSWORD") {
        credentials[key] = value;
      }
    }

    if (!credentials.TEST_USERNAME || !credentials.TEST_PASSWORD) {
      throw new Error(`Invalid demo credentials format. Got: ${JSON.stringify(credentials)}`);
    }

    return credentials as DemoCredentials;
  } catch (error) {
    throw new Error(`Failed to fetch demo credentials from ${baseUrl}/.env.demo: ${error}`);
  } finally {
    await ctx.dispose();
  }
}
