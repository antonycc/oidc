# OpenID Connect Provider

**Mission:** A production-ready OpenID Connect provider that is fully functional for direct use or integration behind AWS Cognito, while maintaining complete transparency and inspectability at every level of implementation.

This serverless OIDC provider delivers standards-compliant authentication with comprehensive logging, structured for both standalone deployment and enterprise integration scenarios. The implementation prioritizes code clarity, operational transparency, and zero-cost-at-rest economics.

## Features

**Production OIDC Provider:**
- **Standards-compliant** OAuth2/OpenID Connect implementation
- **Direct deployment** as standalone authentication service
- **Cognito integration** as external identity provider
- **Comprehensive logging** for operational transparency
- **Complete API documentation** with [Interactive Swagger UI](/swagger.html) and [OpenAPI spec](/openapi.yaml)

**Developer-Focused Design:**
- **Complete code inspection** across all layers
- **Minimal dependencies** for easy understanding
- **Clear architecture** separating concerns
- **Extensive testing** with Playwright scenarios

## Quick Start: Deploy Your OIDC Provider

1. **Fork this repository** to your GitHub account
2. **Configure your domain** and AWS credentials (see [Setup](#setup))
3. **Deploy via GitHub Actions**:
   - **Production**: Push to `main` branch → deploys to your configured domain
   - **CI Testing**: Manual dispatch with `deploymentName: ci` → deploys to CI subdomain
   - **Branch Testing**: Any branch push → temporary deployment with auto-cleanup
4. **Validate with Playwright tests** (screenshots, videos, traces included)

**Test immediately against production deployment:**
- **Live instance**: https://oidc.antonycc.com
- **Test credentials**: `test-user` / `****`
- **Direct login flow**: [Try it now](https://oidc.antonycc.com/login.html)

## Architecture

**Core Stack:**
- **CDK Java v2**: Infrastructure as code with explicit resource definitions
- **Node.js 22 ESM Lambda**: Authorization, token, userinfo, and JWKS endpoints
- **DynamoDB**: User store, authorization codes, and JWKS with TTL policies
- **CloudFront + S3**: Static content delivery with Origin Access Control

**Design Principles:**
- **Pay-per-request**: Zero cost at rest, scales automatically under load
- **Complete transparency**: Structured logging captures every decision point
- **Standards compliance**: OAuth2 RFC 6749 and OpenID Connect Core 1.0
- **Dual deployment**: Direct authentication service or Cognito integration

## Performance

The serverless architecture scales automatically from zero to peak demand while maintaining consistent response times and reliability through AWS Lambda's built-in scaling.

## Screenshots

### Home Page
The main landing page explains the project and provides links to test flows:

![Home Page](docs/screenshots/home-page.png)

### Direct Login Form
Test the OIDC provider directly without going through Cognito:

![Login Page](docs/screenshots/login-page.png)

### Post-Authentication Results
Shows the complete OAuth2 flow results including tokens and claims:

![Post-Auth Page](docs/screenshots/post-auth-page.png)

## API Reference

**📖 Complete API Documentation**
- **[Interactive API Documentation (Swagger UI)](/swagger.html)** - Try the API directly in your browser
- **[OpenAPI 3.0 Specification (YAML)](/openapi.yaml)** - Machine-readable API specification
- **[OpenID Connect Discovery](/.well-known/openid-configuration)** - Live OIDC provider metadata

### Quick Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/.well-known/openid-configuration` | GET | OIDC Discovery document |
| `/authorize` | GET/POST | OAuth2 authorization endpoint |
| `/token` | POST | Token exchange endpoint |
| `/userinfo` | GET | User information endpoint |
| `/jwks` | GET | JSON Web Key Set for token verification |

### Authentication Flow

1. **Direct user to authorization endpoint** with OIDC parameters
2. **User authenticates** with username/password
3. **Receive authorization code** via redirect
4. **Exchange code for tokens** at token endpoint
5. **Access user info** with access token

For detailed request/response examples, schemas, and interactive testing, visit the **[Swagger UI documentation](/swagger.html)**.

### Client Configuration

TODO: Add more

#### `self-client` - For Direct Testing
```javascript
{
  "redirectUris": [
    "${BASE_URL}/post-auth.html",
    "${BASE_URL}/callback.html",
    "${BASE_URL}/login-callback.html"
  ],
  "grantTypes": ["authorization_code"],
  "scopes": ["openid", "email", "profile"],
  "pkceRequired": true,
  "clientSecret": null // Public client
}
```

## Integration Guide

The production OIDC provider at `https://oidc.antonycc.com` can be integrated as an authentication provider in several ways:

### Direct OIDC Integration

Use the OIDC provider directly in your applications by implementing the standard OAuth2/OIDC flow:

**1. Discovery Endpoint**
```bash
curl https://oidc.antonycc.com/.well-known/openid-configuration
```

**2. Configure Your Application**
- **Issuer:** `https://oidc.antonycc.com`
- **Client ID:** `self-client` (for direct integration)
- **Redirect URIs:** Configure your callback URLs
- **Scopes:** `openid email profile`
- **Flow:** Authorization Code with PKCE

**3. Example Integration (Node.js)**
```javascript
import { generators, Issuer } from 'openid-client';

// Discover the provider
const issuer = await Issuer.discover('https://oidc.antonycc.com');

// Create client
const client = new issuer.Client({
  client_id: 'self-client',
  redirect_uris: ['https://your-app.com/callback'],
  response_types: ['code'],
});

// Generate PKCE challenge
const code_verifier = generators.codeVerifier();
const code_challenge = generators.codeChallenge(code_verifier);

// Redirect to authorization endpoint
const authUrl = client.authorizationUrl({
  scope: 'openid email profile',
  code_challenge,
  code_challenge_method: 'S256',
});

// Exchange code for tokens (in your callback handler)
const tokenSet = await client.callback('https://your-app.com/callback',
  { code: authCode }, { code_verifier });
```

### AWS Cognito Integration

Integrate the OIDC provider as an external identity provider in AWS Cognito:

**1. Create Identity Provider in Cognito User Pool**
```bash
aws cognito-idp create-identity-provider \
  --user-pool-id us-east-1_XXXXXXXXX \
  --provider-name "Provider" \
  --provider-type OIDC \
  --provider-details '{
    "oidc_issuer": "https://oidc.antonycc.com",
    "client_id": "cognito-web",
    "authorize_scopes": "openid email profile",
    "attributes_request_method": "GET"
  }' \
  --attribute-mapping '{
    "email": "email",
    "email_verified": "email_verified",
    "name": "name",
    "given_name": "given_name",
    "family_name": "family_name"
  }'
```

**2. Update User Pool Client**
```bash
aws cognito-idp update-user-pool-client \
  --user-pool-id us-east-1_XXXXXXXXX \
  --client-id YOUR_CLIENT_ID \
  --supported-identity-providers Provider,COGNITO
```

**3. Test the Integration**
Navigate to your Cognito Hosted UI - users can now sign in using the OIDC provider.

### Cross-Account Cognito Resource Linking

To use the production Cognito instance (`auth.oidc.antonycc.com`) from another AWS account:

**1. Cross-Account Resource Sharing**
The production Cognito User Pool and resources are deployed in the primary account. To use them from another account:

```bash
# Get the production Cognito details
aws cognito-idp describe-user-pool \
  --user-pool-id us-east-1_XXXXXXXXX \
  --region us-east-1
```

**2. Create IAM Role for Cross-Account Access**
In your target account, create a role that can assume cross-account permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::YOUR-ACCOUNT:root"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "sts:ExternalId": "unique-external-id"
        }
      }
    }
  ]
}
```

### Testing Your Integration

**1. Manual Testing**
- Access the login flow: `https://oidc.antonycc.com/login.html`
- Use test credentials: `test-user` / ${{ secrets.TEST_PASSWORD }} (In GitHub Secrets)
- Verify token exchange and userinfo endpoints

**2. Automated Testing**
```bash
# Test the complete OIDC flow
BASE_URL=https://oidc.antonycc.com \
TEST_USERNAME=test-user \
TEST_PASSWORD=**** \
npx playwright test
```

**3. Load Testing**
The provider supports concurrent authentication flows. For production-like testing:

---

## Setup

- Node 22, Java 21, AWS CLI, CDK v2, Maven wrapper.
- Existing Route53 hosted zone for your domain.

**Reference:** [GitHub OIDC with AWS Documentation](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)

## Deployment Environments

This repository supports three deployment patterns:

### Production (main branch)
- **Domains**: `oidc.antonycc.com` / `auth.oidc.antonycc.com`
- **Trigger**: Automatic on push to `main` branch
- **Infrastructure**: All stacks deployed and persistent
- **Configuration**: Uses `.env.prod`

### CI (manual dispatch)
- **Domains**: `ci.oidc.antonycc.com` / `ci.auth.oidc.antonycc.com`
- **Trigger**: Manual GitHub Actions dispatch with `deploymentName: ci`
- **Infrastructure**: Shared Observability and Cognito stacks, separate OIDC Provider stack
- **Configuration**: Uses `.env.ci`

### Branch Testing (any branch)
- **Domains**: `ci-{branch}.oidc.antonycc.com` / `ci-{branch}.auth.oidc.antonycc.com`
- **Trigger**: Automatic on push to any branch except `main`
- **Infrastructure**: Shares CI Observability and Cognito, deploys ephemeral OIDC Provider stack
- **Cleanup**: OIDC Provider stack automatically destroyed after successful tests
- **Configuration**: Uses `.env.ci` with dynamic domain computation

### Required Certificates
For all CI deployments to work, you need wildcard certificates:
- `*.oidc.antonycc.com` (for OIDC provider endpoints)
- `*.auth.oidc.antonycc.com` (for Cognito auth endpoints)

Both certificates must be in the `us-east-1` region for CloudFront compatibility.

---

## License

MIT License - see LICENSE file for details.

---

## Notes

- Lambda Node.js 22 with ES modules (`"type": "module"`) is fully supported
- Function URLs with IAM auth and CloudFront OAC provide secure, scalable distribution
- All resources are tagged and configured for easy cleanup and cost tracking
- This implementation prioritizes debugging transparency over production optimization

**For production use:** Consider implementing client secrets, rate limiting, user management APIs, and compliance with your organization's security standards.

1. Create IAM OIDC provider for `https://token.actions.githubusercontent.com` (or use console wizard).
2. Create IAM role with trust policy allowing your repo to assume it, and attach minimal policies for CloudFormation/CDK, S3, CloudFront, DynamoDB, Cognito, Route53, ACM.
3. Put the role ARN in repo variable `DEPLOY_ROLE_ARN`.
Docs and examples: GitHub + AWS OIDC setup and action usage.

**Trust policy (example)**
(Including local user for manual testing)
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::403027849202:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:antonycc/oidc:main"
        }
      }
    },
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": [
          "arn:aws:iam::541134664601:user/antony-local-user"
        ]
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

To grant the local use access to assume the role, the local user needs to have this statement in its policy:
```json
        {
            "Sid": "Statement4",
            "Effect": "Allow",
            "Action": [
                "sts:AssumeRole",
                "sts:TagSession"
            ],
            "Resource": [
                "arn:aws:iam::403027849202:role/oidc-github-actions-deploy-role"
            ]
        }
```

---

## Configure repo variables (Settings → Secrets and variables → Actions → *Variables*)

* `DEPLOY_ROLE_ARN` IAM role for GitHub OIDC e.g. `arn:aws:iam::403027849202:role/oidc-github-actions-deploy-role`
* For testOnly runs against an existing deploy, optionally:

  * `COGNITO_DOMAIN`, `COGNITO_CLIENT_ID`

---

## Provision domain and certificate (one time)

You must own a Route53 hosted zone for your root domain (e.g. antonycc.com) and provision an ACM certificate in us-east-1
for the exact domain you will use (e.g. oidc.antonycc.com). The stack expects both to already exist.

Steps:
- Create or identify your hosted zone in Route53 and note `HOSTED_ZONE_NAME` and `HOSTED_ZONE_ID`.
- In AWS Certificate Manager in region us-east-1, request a public certificate for `DOMAIN_NAME` (and optionally `www.DOMAIN_NAME` if needed).
- Choose DNS validation and add the CNAME records to the same Route53 hosted zone.
- Wait until the certificate is issued, then copy its `CERTIFICATE_ARN`.

Pass `DOMAIN_NAME` and `CERTIFICATE_ARN` via environment variables when deploying.

---

## Code style, formatting, and IDE setup

Formatting and linting are enforced by the project configuration. Do not restate style rules in prose — rely on the tools and their defaults given our config.

- JavaScript/Node (ESM)
  - ESLint flat config: see eslint.config.js (Google style base with tweaks) and eslint-plugin-prettier/recommended to enforce Prettier formatting via ESLint errors. Prettier is configured via .prettierrc at the repository root.
  - Node engine: >= 22 (package.json engines)
  - Check: npm run formatting:js
  - Fix: npm run formatting:js-fix
  - Reference: https://eslint.org/docs/latest/use/configure/configuration-files-new and https://prettier.io/docs/en/options.html
- Java (CDK app)
  - Spotless Maven plugin using Palantir Java Format 2.50.0; removes unused imports and normalizes imports/newlines. See pom.xml for the authoritative config.
  - Check: npm run formatting:java (./mvnw spotless:check)
  - Fix: npm run formatting:java-fix (./mvnw spotless:apply)
  - Reference: https://github.com/diffplug/spotless/tree/main/plugin-maven and https://github.com/palantir/palantir-java-format
- All files
  - Check everything: npm run formatting
  - Fix everything: npm run formatting-fix

IDE setup (recommended)

VS Code
- Install extensions: dbaeumer.vscode-eslint, esbenp.prettier-vscode
- Settings (per-workspace or user):
  ```json
  {
    "eslint.useFlatConfig": true,
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.formatOnSave": true,
    "editor.codeActionsOnSave": {
      "source.fixAll.eslint": true
    },
    "files.eol": "\n"
  }
  ```
- Run fixes on demand: "ESLint: Fix all problems" or execute npm run formatting-fix

JetBrains (IntelliJ IDEA / WebStorm)
- JavaScript/Node:
  - Settings → JavaScript → Code Quality Tools → ESLint → Automatic ESLint configuration; enable "Run eslint --fix on save" (Settings → Tools → Actions on Save).
  - Install Prettier plugin; enable "Run Prettier on save" (and/or on reformat). Prettier uses the project .prettierrc; ESLint will report deviations via the prettier plugin.
- Java:
  - Import the project as a Maven project. Use the Maven tool window to run spotless:apply, or run npm run formatting:java-fix.
  - Optional: the google-java-format plugin provides an approximation in-editor, but the canonical formatter is Spotless (Palantir Java Format). Always run Spotless before committing.

Pre-commit tip: run npm run formatting locally before pushing. CI expects the codebase to pass these checks.

---

## Build, Synth, Deploy

From repo root:
```bash

export DEPLOY_ROLE_ARN=arn:aws:iam::403027849202:role/oidc-github-actions-deploy-role
```

Assume role for local deploys (or use AWS_PROFILE):
```bash

source scripts/assume-deployment-role.sh
```

Synth (generates cdk.out via cdk.json):
```bash

./mvnw --errors clean compile exec:java
```

One time per account CDK set-up:
```bash

npx cdk bootstrap
```

Build Lambda container image:
```bash

docker build -t oidc-base:latest -f Dockerfile .
```

> **Note**: Docker builds are deterministic to ensure reproducible deployments. See [docs/docker-determinism.md](docs/docker-determinism.md) for details on maintaining this when updating dependencies.

CDK build:
```bash

npm run build
```

Deploy Oidc Provider:
```bash

npx dotenv -e .env.prod -- \
  npx npx cdk deploy ProviderStack-$ENV_NAME \
    --require-approval never \
    --outputs-file cdk.out/cdk-outputs-oidc-provider.json \
    ;
```

Smoke test the provider (replace with your domain):
```bash

curl --head 'https://oidc.antonycc.com/'
curl --head 'https://oidc.antonycc.com/login.html'
curl --include --request GET 'https://oidc.antonycc.com/.well-known/openid-configuration'
curl --include --request GET 'https://oidc.antonycc.com/jwks'
curl --include --request GET 'https://oidc.antonycc.com/authorize'
curl --include --request POST 'https://oidc.antonycc.com/token'
curl --include --request GET 'https://oidc.antonycc.com/userinfo'
```

Deploy Cognito Client:
```bash

npx dotenv -e .env.prod -- \
  npx npx cdk deploy CognitoStack-$ENV_NAME \
    --exclusively \
    --require-approval never \
    --outputs-file cdk.out/cdk-outputs-cognito.json \
    ;
```

CDK CLI executes the Java app via `cdk.json`.

**Outputs:**
`BaseUrl` (CloudFront domain for issuer and web), `CognitoAuthDomain`, `UserPoolId`, `UserPoolClientId`.

---

## Provision users for tests

Users are stored in DynamoDB (`Users` table). For deployed environments:

```bash
# Create a test user (using environment defaults)
USERS_TABLE=<UsersTableName> npm run users:provision test-user ****

# Clear all users
USERS_TABLE=<UsersTableName> npm run users:clear
```

The production deployment at `oidc.antonycc.com` includes the test user `test-user` with password `****` for integration testing.

---

## Run Playwright behaviour tests

```bash
# from repo root
npm ci
npx playwright install --with-deps

# Test against production deployment
export BASE_URL=https://oidc.antonycc.com
export TEST_USERNAME=test-user
export TEST_PASSWORD=****

npx playwright test --project=chromium

# Or test against your own deployment using outputs from deploy
export BASE_URL=https://<subdomain>.<zone>
export COGNITO_DOMAIN=<domain from output>
export COGNITO_CLIENT_ID=<client from output>

npx playwright test --project=chromium
```

The config records screenshots, **videos**, and **traces** for every test. Upload these as workflow artifacts to debug flakiness.

---

## GitHub Actions

* **Run full deploy + tests:** push to `main` or run workflow\_dispatch with `testOnly=false`.
* **Run tests only:** run `workflow_dispatch` with `testOnly=true` and supply `baseUrl` input (or set variables for an existing stack).

Artifacts uploaded: `playwright-report` (HTML), `test-results` (traces, screenshots, videos). Treat traces as sensitive.

---

## Authentication load tests

Below is a proposed approach for running the authentication load tests against `oidc.antonycc.com`, along with the complete source files you’ll need.

### Mechanism overview

* **Load generation** – A Node.js script uses Playwright's request API to drive the OpenID Connect code‑exchange flow. Each virtual user:

    1. Generates a unique username and PKCE code verifier/challenge.
    2. Sends a GET request to `/authorize` with the required query parameters (including `code_challenge`, username and password).
    3. Parses the `code` value from the 302 redirect’s `Location` header.
    4. Exchanges the code for tokens via a POST to `/token`.

* **Scenarios** – The script defines four scenarios (small, medium, large, xlarge) matching the requested loads:

    * 5 000 users over 1 minute (100/10 s → 1000/10 s → \~98 rps).
    * 10 000 users over 2 minutes (same initial ramps → \~89 rps steady phase).
    * 100 000 users over 5 minutes (100/10 s, 1000/10 s, 1000/1 s spike, then \~351 rps).
    * 1 000 000 users over 10 minutes (same ramps as 100 k, then \~1 724 rps steady).

  Each scenario uses k6’s `ramping-arrival-rate` executor to approximate the ramp patterns and achieve the total user counts.

* **Local testing** – To run locally, install k6 (`brew install k6` or `apt-get install k6`) and execute:

  ```sh
  # run the 5k test against your deployment
  k6 run load-tests.js --scenario small --env TARGET_URL=https://oidc.antonycc.com
  ```

  You can override `CLIENT_ID`, `REDIRECT_URI`, `PASSWORD` and `USERNAME_PREFIX` via `--env` parameters as needed.

* **GitHub Actions** – A workflow (`.github/workflows/load-test.yml`) installs Node.js and Playwright in the CI environment, then runs the chosen scenario.  It exposes a `workflow_dispatch` input to run any scenario on demand and schedules the 10 k test weekly at 04:00 on Sundays (Europe/London timezone).  Test results (summary JSON) are saved as an artifact.

### Files

* **Playwright load‑test script** – Defines the four scenarios and implements the test flow using the same logic as `tests/api.live.test.ts`:

`scripts/load-test.mjs`

* **GitHub Actions workflow** – Runs the tests and schedules the weekly 10 k test:

`load-test.yml`

To use these files, place `load-tests.js` in the root of your repository and `load-test.yml` under `.github/workflows/`.  Adjust the environment variables in the workflow to match your client ID and password. The 10 k scenario will then run automatically every Sunday at 4 a.m. UK time, while other scenarios can be triggered manually from the Actions tab.

Let me know if you’d like help fine‑tuning the ramp patterns or integrating the test results into a dashboard.

run the 5k test against your deployment:
```bash

BASE_URL=https://oidc.antonycc.com TEST_USERNAME=test-user TEST_PASSWORD=**** node scripts/load-test.mjs
```

---

## Verbose logging

All handlers log structured JSON on every step (inputs redacted where needed). CloudWatch log groups are set to **ONE_WEEK** retention.
Lambda Node 22, Function URLs, and CloudFront origins are standard.

---

## Marketplace path (succinct)

1. **Conformance:** Run OpenID Provider conformance suite and publish results.
2. **Multi-tenant:** Partition DDB tables by tenant, isolate keys, add rate limits.
3. **Key mgmt:** Move keys to KMS + S3 persisted JWKS with rotation and overlapping `kid`.
4. **SLAs/limits:** Define MAU and throughput tiers undercutting incumbents.
5. **Packaging:** CDK app as a SaaS offering; provide CloudFormation template + quickstart.
6. **Supportability:** Keep verbose logs, traces, and admin APIs for user CRUD.
7. **Pricing:** Free at rest, request-based. Competes against Auth0, FusionAuth hosted; your cost is Lambda+CF+S3+DDB only.

---

## Common gotchas (repeat, read twice)

* **You must own the hosted zone** in Route53 and set `HOSTED_ZONE_ID` accurately.
* **Certificates for CloudFront live in `us-east-1`.** Bring your own ACM certificate issued in `us-east-1` and pass its ARN via `CERTIFICATE_ARN`.
* **BASE_URL env for tests must match the CloudFront domain output.**
* **Cognito callback URL must be** `https://<domain_name>/post-auth.html`.
* **Playwright browsers must be installed in CI** with `npx playwright install --with-deps`.
* **Test credentials for production are:** `test-user` / `****`

---

## Local dry-run checklist (tired-mode)

* `./mvnw --errors compile exec:java` → no exceptions.
* `npx cdk synth` → template appears.
* `npx cdk deploy` → outputs show `BaseUrl` and Cognito values.
* `npm run users:provision test-user ****` → prints `created`.
* `BASE_URL=... COGNITO_DOMAIN=... COGNITO_CLIENT_ID=... npx playwright test` → tests pass.
* Check **Actions artifacts** for `playwright-report`, `test-results` folders.

If a first cold start slows `/authorize`, Playwright has 90s timeout in config. Lambda Node 22 cold starts are typical and within test budgets.

**Alternative: Test against production immediately:**
* `BASE_URL=https://oidc.antonycc.com TEST_USERNAME=test-user TEST_PASSWORD=**** npx playwright test` → tests pass.

---

### Notes
- Lambda Node.js 22, handler `file.handler` with `.mjs` and `"type":"module"` is valid.
- Function URL origins and CloudFront OAC are shown with official CDK API examples.

If you want this zipped as a starter repo or need the CDK stack split into web/issuer/provider stacks, say so.
