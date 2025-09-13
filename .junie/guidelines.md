# Project-specific development guidelines (OIDC)

Audience: advanced contributors to this repository. This document captures non-obvious build, configuration, and testing conventions validated against the current codebase.

Repository layout (high level)
- infra/ — Java 21 AWS CDK app and JUnit 5 tests (nonstandard Maven source dirs).
- app/oidc/ — Node (ESM) application workspace with Vitest unit tests.
- tests/ — Playwright end-to-end behaviour tests (configured via playwright.config.js testDir).
- web/ — Static pages used by the OIDC provider flows.
- well-known/ — Static OIDC discovery docs distributed via S3/CloudFront.

Toolchains
- Node >= 22 (enforced by root package.json). ESM everywhere (type: module at repo root).
- Java 21 (enforced via root pom.xml). Maven wrapper checked in (./mvnw).

Validated setup (local)
- Dependencies from repo root: npm ci
- Playwright browsers once per machine: npx playwright install --with-deps
- Java/Maven are used only for the CDK app and tests (see below).

Build and configuration
1) Node workspace bootstrap (root)
- Install dependencies: npm ci
- This repo uses workspaces: ["app/oidc"]. All Node deps are managed at the root.

2) CDK synth (no deploy)
- The CDK entrypoint is Java (exec-maven-plugin, main class: com.antonycc.oidc.ProviderApplication).
- Nonstandard Maven source roots are configured in pom.xml:
  - <sourceDirectory>infra/main/java</sourceDirectory>
  - <testSourceDirectory>infra/test/java</testSourceDirectory>
- Compile and run the CDK app to synthesize (no AWS changes):
  ./mvnw --errors clean compile exec:java
- The CDK app reads environment variables with sensible defaults when not provided:
  ENV_NAME, HOSTED_ZONE_NAME, HOSTED_ZONE_ID, DOMAIN_NAME, CERTIFICATE_ARN, COGNITO_DOMAIN_PREFIX

3) Deploy (for environments that need E2E)
- Requires valid AWS credentials and these env vars:
  ENV_NAME, HOSTED_ZONE_NAME, HOSTED_ZONE_ID, DOMAIN_NAME, CERTIFICATE_ARN, COGNITO_DOMAIN_PREFIX
- Typical sequence (mirrors CI expectations):
  export ENV_NAME=dev
  export HOSTED_ZONE_NAME=example.com
  export HOSTED_ZONE_ID=Z123...
  export DOMAIN_NAME=oidc.example.com
  export CERTIFICATE_ARN=arn:aws:acm:...
  export COGNITO_DOMAIN_PREFIX=oidc-dev-xyz
  npx cdk bootstrap
  npx cdk deploy AppStack-${ENV_NAME} --require-approval never --outputs-file cdk.out/cdk-outputs.json
- CDK outputs consumed by tests:
  - From AppStack: BaseUrl → Playwright BASE_URL
  - From CognitoStack: CognitoAuthDomain → Playwright COGNITO_DOMAIN
  - From CognitoStack: UserPoolClientId → Playwright COGNITO_CLIENT_ID

Testing
A) Unit tests (Vitest)
- Discovery pattern (vitest.config.js): app/oidc/test/**/*.test.mjs
- Run unit tests only:
  npm run test:unit
- Run one test file / named case:
  npx vitest run app/oidc/test/authorize.test.mjs -t "renders login form"
- Add a new unit test (ESM, .mjs):
  File: app/oidc/test/demo.test.mjs
  Content:
  import { describe, it, expect } from 'vitest';
  describe('demo', () => { it('adds', () => { expect(1 + 1).toBe(2); }); });
- Validation: We created a file with the snippet above and verified npm run test:unit passes locally alongside existing tests; then removed the demo file to keep the repo clean.

B) Infra tests (JUnit 5)
- Location: infra/test/java (note the nonstandard path configured in pom.xml).
- Example present: SynthTest constructs AppStack and CognitoStack with dummy props and calls app.synth().
- Run all infra tests:
  ./mvnw --errors test
- Validation: This command passed locally (BUILD SUCCESS).

C) Behaviour tests (Playwright)
- Config: playwright.config.js uses testDir: ./tests, artifacts always on.
- Env required at runtime:
  BASE_URL — e.g., https://oidc.example.com (from CDK BaseUrl output)
- Run headless Chromium only:
  BASE_URL="https://…" npx playwright test --project=chromium
- Developer modes:
  npm run test:e2e:ui     # Playwright UI runner
  npm run test:e2e:headed # Headed browser without UI runner
- Artifacts: HTML report in ./playwright-report, per-test traces/screenshots/videos in ./test-results.
- Tests overview: tests/flow.spec.ts drives Cognito Hosted UI → OP authorize → redirect back; also direct login form scenarios and a simple home page render.

D) Provisioning test data
- Provision a local test user in the DynamoDB table used by app/oidc:
  npm run users:provision <username> <password>
- Clear users:
  npm run users:clear
- Notes: These scripts expect USERS_TABLE to be set and valid AWS credentials/region. CI sets USERS_TABLE; set it locally to target your environment.

Additional development notes
- Formatting & style: Use ESLint (flat) + Prettier for JS (ESM) and Spotless (Palantir Java Format) for Java. Commands: npm run formatting (check), npm run formatting-fix (fix), npm run formatting:js, npm run formatting:java. See README for IDE setup.
- Coding style: ESM modules only (.mjs for tests). Keep unit tests under app/oidc/test. Avoid CommonJS.
- Java: Target 21; tests use JUnit Jupiter via Surefire 3.2.5. Do not relocate Java sources unless you also update pom.xml (nonstandard infra paths are intentional).
- CDK specifics:
  - OIDC endpoints (authorize/token/userinfo) are served behind CloudFront using the domain configured via DOMAIN_NAME; BaseUrl output uses https://{DOMAIN_NAME}.
- Debugging:
  - Playwright: set DEBUG=pw:api for verbose logs; open traces with npx playwright show-trace test-results/**/trace.zip; run with --headed/--ui locally.
  - CDK: inspect synthesized templates in cdk.out; check cdk.out/cdk-outputs.json for endpoints; run Java entrypoint with --errors and provide env vars for clarity.
  - AWS: region is us-east-1 in CI; ensure credentials point to the intended account. For deploy-role assumptions, see scripts/assume-deployment-role.sh if present.
- CI assumptions: The (reference) workflow builds infra with Java 21, Node 22, deploys CDK, and runs Playwright with BASE_URL/COGNITO_* sourced from CDK outputs or workflow inputs.

Quick commands (copy/paste)
- Install: npm ci && npx playwright install --with-deps
- Unit tests: npm run test:unit
- Infra tests: ./mvnw --errors test
- Synth only: ./mvnw --errors clean compile exec:java
- E2E (chromium): BASE_URL="https://…" COGNITO_DOMAIN="…" COGNITO_CLIENT_ID="…" npx playwright test --project=chromium

Change log for this document
- 2025-08-24: Document created; commands validated: npm run test:unit and ./mvnw --errors test.
