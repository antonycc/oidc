# OIDC Provider - Serverless Debugging Utility

> **🔧 This is a debugging and testing utility, not a production authentication service.**

## What This Is

A **lightweight, inspectable OIDC provider** designed for developers who need to:
- **Debug OAuth2/OIDC flows** with comprehensive logging
- **Test authentication integrations** with a real OIDC provider
- **Learn OIDC implementations** by examining working code
- **Clone and customize** for specific testing scenarios

## Quick Start: Fork → Configure → Deploy → Test

1. **Fork this repository** to your GitHub account
2. **Set up your domain** and AWS credentials (see [Setup](#setup))
3. **Deploy via GitHub Actions**:
   - **Production**: Pushes to `main` branch auto-deploy to `oidc.antonycc.com` / `auth.oidc.antonycc.com`
   - **CI Testing**: Use manual dispatch with `deploymentName: ci` to deploy to `ci.oidc.antonycc.com` / `ci.auth.oidc.antonycc.com`
   - **Branch Testing**: Any branch push deploys to `ci-{branch}.oidc.antonycc.com` / `ci-{branch}.auth.oidc.antonycc.com` and auto-cleans up after tests
4. **Test with included Playwright scenarios** (screenshots, videos, traces)

## Architecture

**Tech Stack:** CDK Java v2, Node.js 22 ESM Lambdas, CloudFront+S3 (OAC), DynamoDB TTL, Cognito User Pool integration

**Why Serverless:** Pay-per-request pricing, automatic scaling, comprehensive CloudWatch logging (7-day retention), infrastructure-as-code with destroy-on-delete for safe testing environments.

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

### Supported Endpoints

| Endpoint | Method | Purpose | Example |
|----------|--------|---------|---------|
| `/.well-known/openid-configuration` | GET | OIDC Discovery | Returns provider metadata |
| `/authorize` | GET/POST | Authorization endpoint | Initiates OAuth2 flow |
| `/token` | POST | Token endpoint | Exchanges code for tokens |
| `/userinfo` | GET | UserInfo endpoint | Returns user claims |
| `/jwks` | GET | JWKS endpoint | Public keys for token verification |

### Authorization Endpoint (`/authorize`)

**GET Request** - Returns login form:
```
GET /authorize?client_id=demo-client&redirect_uri=https://example.com/callback&response_type=code&scope=openid&state=abc123
```

**POST Request** - Submits credentials:
```
POST /authorize
Content-Type: application/x-www-form-urlencoded

client_id=demo-client&
redirect_uri=https://example.com/callback&
response_type=code&
scope=openid email profile&
state=abc123&
code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&
code_challenge_method=S256&
username=test-user&
password=Passw0rd!
```

**Success Response:**
```
HTTP/1.1 302 Found
Location: https://example.com/callback?code=01J6EXAMPLE123&state=abc123
```

### Token Endpoint (`/token`)

**Request:**
```
POST /token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&
code=01J6EXAMPLE123&
redirect_uri=https://example.com/callback&
client_id=demo-client&
code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
```

**Response:**
```json
{
  "id_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 300
}
```

### UserInfo Endpoint (`/userinfo`)

**Request:**
```
GET /userinfo
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "sub": "test-user",
  "email": "test@example.com",
  "email_verified": true,
  "name": "Test User",
  "given_name": "Test",
  "family_name": "User"
}
```

### Client Configuration

The provider supports two pre-configured clients:

#### `cognito-web` - For Cognito Integration
```javascript
{
  "redirectUris": ["https://${COGNITO_DOMAIN}/oauth2/idpresponse"],
  "grantTypes": ["authorization_code"],
  "scopes": ["openid", "email", "profile"],
  "pkceRequired": true,
  "clientSecret": null // Public client
}
```

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

* `HOSTED_ZONE_NAME` e.g. `antonycc.com`
* `HOSTED_ZONE_ID` e.g. `Z079976717QZCYMJ02NI2`
* `DOMAIN_NAME` e.g. `oidc.antonycc.com` (must be within the hosted zone)
* `CERTIFICATE_ARN` e.g. `arn:aws:acm:us-east-1:403027849202:certificate/62ef0526-06c0-4744-9cee-33300d716633` (ACM in us-east-1 for CloudFront)
* `COGNITO_DOMAIN_PREFIX` e.g. `com-antonycc-oidc-prod`
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
  npx npx cdk deploy OidcProviderStack-$ENV_NAME \
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

Users are stored in DynamoDB (`Users` table). CI calls:

```bash
# Create a test user (defaults shown)
USERS_TABLE=<UsersTableName> npm run users:provision test-user Passw0rd!

# Clear all users
USERS_TABLE=<UsersTableName> npm run users:clear
```

---

## Run Playwright behaviour tests

```bash
# from repo root
npm ci
npx playwright install --with-deps

# Using outputs from deploy
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

* **Load generation** – A [k6](https://k6.io/) JavaScript script drives the OpenID Connect code‑exchange flow.  Each virtual user:

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

* **GitHub Actions** – A workflow (`.github/workflows/load-test.yml`) installs k6 in the CI environment, then runs the chosen scenario.  It exposes a `workflow_dispatch` input to run any scenario on demand and schedules the 10 k test weekly at 04:00 on Sundays (Europe/London timezone).  Test results (summary JSON) are saved as an artifact.

### Files

* **k6 load‑test script** – Defines the four scenarios and the test flow:

`load-tests.js`

* **GitHub Actions workflow** – Runs the tests and schedules the weekly 10 k test:

`load-test.yml`

To use these files, place `load-tests.js` in the root of your repository and `load-test.yml` under `.github/workflows/`.  Adjust the environment variables in the workflow to match your client ID and password. The 10 k scenario will then run automatically every Sunday at 4 a.m. UK time, while other scenarios can be triggered manually from the Actions tab.

Let me know if you’d like help fine‑tuning the ramp patterns or integrating the test results into a dashboard.

run the 5k test against your deployment:
```bash

k6 run load-tests.js --scenario small --env TARGET_URL=https://oidc.antonycc.com
```

---

## Verbose logging

All handlers log structured JSON on every step (inputs redacted where needed). CloudWatch log groups are set to **ONE\_WEEK** retention.
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
* **BASE\_URL env for tests must match the CloudFront domain output.**
* **Cognito callback URL must be** `https://<domain_name>/post-auth.html`.
* **Playwright browsers must be installed in CI** with `npx playwright install --with-deps`.

---

## Local dry-run checklist (tired-mode)

* `./mvnw --errors compile exec:java` → no exceptions.
* `npx cdk synth` → template appears.
* `npx cdk deploy` → outputs show `BaseUrl` and Cognito values.
* `npm run users:provision` → prints `created`.
* `BASE_URL=... COGNITO_DOMAIN=... COGNITO_CLIENT_ID=... npx playwright test` → two tests pass.
* Check **Actions artifacts** for `playwright-report`, `test-results` folders.

If a first cold start slows `/authorize`, Playwright has 90s timeout in config. Lambda Node 22 cold starts are typical and within test budgets.

---

### Notes
- Lambda Node.js 22, handler `file.handler` with `.mjs` and `"type":"module"` is valid.
- Function URL origins and CloudFront OAC are shown with official CDK API examples.

If you want this zipped as a starter repo or need the CDK stack split into web/issuer/provider stacks, say so.