# OIDC Provider (Serverless, Cognito-compatible)

**What this is:** An OAuth2/OIDC Provider running on Lambda Function URLs behind CloudFront, with discovery and JWKS on S3, and a Cognito User Pool federated to it for end-to-end login. Everything is pay-per-request, logs retained 7 days, all resources set to destroy on stack deletion.

**Why:** Cheap, inspectable auth for tests and small workloads. Verbose logs aid debugging.

**Tech:** CDK Java v2, Node 20 ESM Lambdas, CloudFront+S3 (OAC), DynamoDB TTL, Cognito Hosted UI. Lambda Node 20 and Function URLs are supported; CloudFront can target Function URLs and S3 via OAC.

---

## Repo Layout (matches your existing style)

- `infra/` – CDK Java app and stack
- `app/oidc-provider/` – Node ESM Lambdas (authorize, token, userinfo) + scripts
- `web/` – Static pages (`index.html`, `post-auth.html`, `oidc.css`)
- `behaviour-tests/` – Playwright config and tests
- `.github/workflows/deploy.yml` – deploy and test workflow

---

## Prereqs

- Node 20, Java 17, AWS CLI, CDK v2, Maven wrapper.  
- Existing Route53 hosted zone for your domain.

---

## One-time AWS role for GitHub Actions (OIDC)

1. Create IAM OIDC provider for `https://token.actions.githubusercontent.com` (or use console wizard).  
2. Create IAM role with trust policy allowing your repo to assume it, and attach minimal policies for CloudFormation/CDK, S3, CloudFront, DynamoDB, Cognito, Route53, ACM.  
3. Put the role ARN in repo variable `DEPLOY_ROLE_ARN`.  
Docs and examples: GitHub + AWS OIDC setup and action usage.

**Trust policy (example)**
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
      "StringLike":   { "token.actions.githubusercontent.com:sub": "repo:<OWNER>/<REPO>:*" }
    }
  }]
}
```

---

## Configure repo variables (Settings → Secrets and variables → Actions → *Variables*)

* `HOSTED_ZONE_NAME` e.g. `example.com`
* `HOSTED_ZONE_ID` e.g. `Z123ABC...`
* `SUB_DOMAIN_NAME` e.g. `oidc`
* `COGNITO_DOMAIN_PREFIX` e.g. `oidc-dev-1234`
* `DEPLOY_ROLE_ARN` IAM role for GitHub OIDC
* For testOnly runs against an existing deploy, optionally:

  * `COGNITO_DOMAIN`, `COGNITO_CLIENT_ID`

---

## Build, Synth, Deploy

```bash
# From repo root
export ENV_NAME=dev
export HOSTED_ZONE_NAME=example.com
export HOSTED_ZONE_ID=Z123ABC...
export SUB_DOMAIN_NAME=oidc
export COGNITO_DOMAIN_PREFIX=oidc-dev-1234

# Synth
mvn -e -q -f infra/pom.xml clean compile exec:java   # generates cdk.out via cdk.json
# Deploy
npx cdk bootstrap
npx cdk deploy OidcProviderStack-$ENV_NAME --require-approval never --outputs-file cdk-outputs.json
```

CDK CLI executes the Java app via `cdk.json`.

**Outputs:**
`BaseUrl` (CloudFront domain for issuer and web), `CognitoAuthDomain`, `UserPoolId`, `UserPoolClientId`.

---

## Provision users for tests

Users are stored in DynamoDB (`Users` table). CI calls:

```bash
# Create a test user (defaults shown)
cd app/oidc-provider
npm ci
USERS_TABLE=<UsersTableName> node scripts/provision-user.mjs test-user Passw0rd!

# Clear all users
USERS_TABLE=<UsersTableName> node scripts/clear-users.mjs
```

---

## Run Playwright behaviour tests

```bash
cd behaviour-tests
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

## Verbose logging

All handlers log structured JSON on every step (inputs redacted where needed). CloudWatch log groups are set to **ONE\_WEEK** retention.
Lambda Node 20, Function URLs, and CloudFront origins are standard.

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
* **Certificates for CloudFront live in `us-east-1`.** We use `DnsValidatedCertificate(region='us-east-1')`.
* **BASE\_URL env for tests must match the CloudFront domain output.**
* **Cognito callback URL must be** `https://<subdomain>.<zone>/post-auth.html`.
* **Playwright browsers must be installed in CI** with `npx playwright install --with-deps`.

---

## Local dry-run checklist (tired-mode)

* `mvn -f infra/pom.xml -q compile exec:java` → no exceptions.
* `npx cdk synth` → template appears.
* `npx cdk deploy` → outputs show `BaseUrl` and Cognito values.
* `node app/oidc-provider/scripts/provision-user.mjs` → prints `created`.
* `BASE_URL=... COGNITO_DOMAIN=... COGNITO_CLIENT_ID=... npx playwright test` → two tests pass.
* Check **Actions artifacts** for `playwright-report`, `test-results` folders.

If a first cold start slows `/authorize`, Playwright has 90s timeout in config. Lambda Node 20 cold starts are typical and within test budgets.

---

### Notes
- Lambda Node.js 22, handler `file.handler` with `.mjs` and `"type":"module"` is valid.
- Function URL origins and CloudFront OAC are shown with official CDK API examples.

If you want this zipped as a starter repo or need the CDK stack split into web/issuer/provider stacks, say so.