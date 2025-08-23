# Project development guidelines (OIDC)

Audience: advanced developers working on this repository. This document captures project-specific build, configuration, and testing conventions that are not obvious from standard tooling.

Repository layout (high level):
- infra/ — Java 21 AWS CDK app and tests (JUnit 5).
- app/oidc/ — Node (ESM) application workspace with unit tests (Vitest).
- behaviour-tests/ — Playwright end-to-end behaviour tests.
- web/ — Static pages used by the OIDC provider flows.

Node and Java toolchain:
- Node >= 22 (package.json engines). ESM everywhere (type: module at repo root).
- Java 21 (infra/pom.xml). Maven wrapper checked in (./mvnw).

CI assumptions (reference): .github/workflows/deploy.yml sets JAVA_VERSION=21, NODE_VERSION=22, builds infra, deploys CDK, then runs Playwright with BASE_URL, COGNITO_DOMAIN, COGNITO_CLIENT_ID set from CDK outputs or workflow inputs.


Build and configuration
1) Node workspace bootstrap
- Install dependencies from repo root:
  npm ci
- Install Playwright browsers once per machine:
  npx playwright install --with-deps

2) Build/compile the CDK app (no deploy)
- Compile and execute the CDK entrypoint (synth path) with Maven Exec Plugin:
  ./mvnw --file infra/pom.xml clean compile exec:java
  (Main class: com.antonycc.oidc.App per infra/pom.xml; this should synth without deployment.)

3) Deploy (for environments that need E2E)
- Expects AWS credentials (OIDC or assume-role) and env variables:
  ENV_NAME, HOSTED_ZONE_NAME, HOSTED_ZONE_ID, DOMAIN_NAME, CERTIFICATE_ARN, COGNITO_DOMAIN_PREFIX.
- Typical local flow (mirrors CI):
  export ENV_NAME=dev
  export HOSTED_ZONE_NAME=example.com
  export HOSTED_ZONE_ID=Z123…
  export DOMAIN_NAME=oidc.example.com
  export CERTIFICATE_ARN=arn:aws:acm:…
  export COGNITO_DOMAIN_PREFIX=oidc-dev-xyz
  npx cdk bootstrap
  npx cdk deploy OidcProviderStack-${ENV_NAME} --require-approval never --outputs-file cdk-outputs.json
- Credentials: use your preferred method or scripts/assume-deployment-role.sh to assume the deployment role (org-specific; inspect file for details).

4) CDK outputs used by tests
After deploy, cdk-outputs.json will contain keys like:
- BaseUrl
- CognitoAuthDomain
- UserPoolClientId
These map to Playwright env vars BASE_URL, COGNITO_DOMAIN, COGNITO_CLIENT_ID.


Testing
A) Unit tests (Vitest)
- Test discovery: only files matching app/oidc/test/**/*.test.mjs (see vitest.config.js).
- Run unit tests only (skips Playwright):
  npm run test:unit
- Run all tests (unit then e2e):
  npm test
- Add a new unit test:
  - Create a file under app/oidc/test/, name it *.test.mjs, using ESM and Vitest APIs (describe/it/expect).
  - Example content that we validated locally:
    import { describe, it, expect } from 'vitest';
    describe('demo', () => {
      it('adds', () => { expect(1 + 1).toBe(2); });
    });
  - Execute:
    npm run test:unit
  - To run one test or a specific name:
    npx vitest run app/oidc/test/your.test.mjs -t "your case"

B) Infra tests (JUnit 5)
- Location: infra/src/test/java.
- Example test present: SynthTest creates OidcStack with dummy props and calls app.synth().
- Run all infra tests:
  ./mvnw -f infra/pom.xml test
- Notes:
  - surefire 3.2.5 with JUnit Platform is configured.
  - Java 21 compilation is set via maven-compiler-plugin properties in pom.

C) Behaviour tests (Playwright)
- Test dir: behaviour-tests/tests (see playwright.config.js).
- Required env vars at runtime:
  - BASE_URL — e.g., https://oidc.example.com (from CDK BaseUrl output).
  - COGNITO_DOMAIN — Cognito Hosted UI domain, e.g., xyz.auth.us-east-1.amazoncognito.com.
  - COGNITO_CLIENT_ID — user pool client id used for the flow.
- Run (headless):
  BASE_URL="https://…" COGNITO_DOMAIN="…" COGNITO_CLIENT_ID="…" npx playwright test --project=chromium
- Developer modes:
  npm run test:e2e:ui     # Playwright UI runner
  npm run test:e2e:headed # Headed browser without UI runner
- Artifacts: HTML report in ./playwright-report, per-test traces/screenshots/videos in ./test-results (CI uploads these).
- What tests do:
  - flow.spec.ts exercises Cognito Hosted UI -> OP login -> redirect back with code, and a simple home page render. It expects a provisioned test user (username, password) where applicable; see CI step that runs npm run provision:user.

D) Provisioning test data
- To provision a local test user in the DynamoDB table used by app/oidc (or environment configured by your AWS profile):
  npm run provision:user <username> <password>
- To clear users:
  npm run clear:users
- These scripts rely on USERS_TABLE being set (CI sets it). When running locally, ensure USERS_TABLE and AWS credentials resolve to the intended table.


Creating and validating a new test (demonstrated)
- We validated unit testing by adding a smoke test under app/oidc/test and running:
  npm run test:unit
- Infra tests were also executed locally via:
  ./mvnw -f infra/pom.xml test
- E2E tests require a deployed environment and correct env vars; reference the Deploy section to stand one up or reuse an existing BASE_URL/COGNITO_*.


Additional development notes
- Coding style:
  - JavaScript/TypeScript: ESM modules, keep tests colocated under app/oidc/test, avoid CommonJS.
  - Java: Use Java 21 features where beneficial; tests use JUnit Jupiter.
- Workspace assumptions:
  - Root package.json defines workspaces: ["app/oidc"]. Install from repo root.
- Debugging:
  - Playwright: set DEBUG=pw:api for verbose logs; open traces with npx playwright show-trace test-results/**/trace.zip; run with --headed/--ui locally.
  - CDK: inspect synthesized templates in cdk.out; check cdk-outputs.json for endpoints; run with --verbose for detailed logs.
  - AWS: ensure correct region (us-east-1 in CI) and credentials; deploy role is provided in CI via OIDC.
- CI interaction:
  - The workflow supports a "testOnly" dispatch that skips deploy and expects a provided baseUrl and configured repo variables for Cognito. Use it to validate against an already deployed env without redeploying.


Appendix: exact paths and versions (as of this commit)
- vitest.config.js → include: app/oidc/test/**/*.test.mjs
- playwright.config.js → testDir: behaviour-tests/tests; use.baseURL: process.env.BASE_URL; artifacts always on.
- infra/pom.xml → Java 21, cdk.version 2.211.0, surefire 3.2.5; exec-maven-plugin mainClass=com.antonycc.oidc.App.
- .github/workflows/deploy.yml → shows end-to-end flow and env wiring used in CI.
