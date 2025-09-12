Here is a concise README‑style walkthrough you can use for a five‑minute lightning talk.  It introduces the structure of the `antonycc/oidc` repository, explains how it behaves at runtime, and reflects on its design from the perspectives of clean architecture and microservice principles.

---

## DIY OIDC Provider – a self‑contained serverless service

This repository implements a full OpenID Connect (OIDC) provider running entirely on AWS serverless services.  It deploys behind CloudFront using Lambda Function URLs, stores state in DynamoDB, exposes well‑known endpoints via S3, and federates with a Cognito user pool.  Everything is pay‑per‑request and the CDK stack destroys resources when torn down.

### Repository tour

* **`infra/` – Infrastructure as code**
  A Java CDK application defines the “ProviderStack”.  It declares S3 buckets for discovery documents, a CloudFront distribution, three Node.js (ESM) Lambda functions for the `/authorize`, `/token` and `/userinfo` endpoints, a user pool, and DynamoDB tables with TTLs.  Deployment options (domain names, hosted zone IDs, etc.) are parameterised via environment variables and outputs.

* **`app/oidc-provider/` – Application logic**
  Three handlers implement the OIDC flows.  The authorization handler validates credentials and writes a one‑time code to DynamoDB; the token handler reads the code, issues an ID token and refresh token, and writes/clears the relevant records; the userinfo handler returns user attributes from an in‑memory map.  Supporting scripts provision or clear users in the DynamoDB table.

* **`web/` – Static front‑end**
  Simple HTML pages (index and post‑auth) allow you to trigger the login flow and display the resulting tokens.  CSS is included for styling.

* **`behaviour-tests/` – End‑to‑end tests**
  Playwright tests exercise the full sign‑in flow against the deployed service.  The configuration installs browser dependencies, logs screenshots, videos and traces, and runs tests via `npm`.

* **CI/CD workflows**
  `.github/workflows/test-and-deploy.yml` (not shown) builds, tests and deploys the stack.  It assumes a GitHub OIDC‑enabled IAM role and reads parameters like hosted zone name, subdomain and Cognito domain from repository variables.  A separate load‑test workflow can be added, as demonstrated earlier.

### Deployment click‑through

1. **Prepare your AWS environment.**  Create a Route 53 hosted zone for your domain and an IAM role that GitHub Actions can assume.  Set repository variables such as `HOSTED_ZONE_NAME`, `SUB_DOMAIN_NAME` and `DEPLOY_ROLE_ARN`.

2. **Build and synth the CDK stack.**  From the repo root run the Maven command shown in the README to compile the Java CDK app and generate the CloudFormation template.

3. **Deploy the stack.**  Bootstrapping is handled by CDK.  Deployment creates a CloudFront distribution, Lambda functions, DynamoDB tables, the user pool and S3 buckets.  Outputs include the base URL for issuer and web, the Cognito domain and client ID.

4. **Provision test users.**  Use the Node scripts under `app/oidc-provider` to add users to the DynamoDB table or clear them when finished.

5. **Run the behaviour tests.**  Configure `BASE_URL`, `COGNITO_DOMAIN` and `COGNITO_CLIENT_ID` with the deployment outputs and execute the Playwright suite to verify that login, token issuance and userinfo flows work end‑to‑end.

### Microservice qualities

This project encapsulates everything needed to run an OIDC provider — infrastructure, application code, tests and deployment pipeline — in a single repository and stack.  It owns its data stores (three DynamoDB tables), exposes a clear network boundary (CloudFront endpoints) and doesn’t rely on any other service to perform its core job.  In that sense it aligns well with the microservice ethos: independent deployment, localised state and a narrowly focused business capability.

The use of pay‑per‑request serverless components ensures it scales from zero to high volumes without pre‑provisioning.  Having infrastructure defined alongside code makes the service reproducible and self‑documenting.  However, there is a trade‑off: mixing Java (CDK) and Node in one repository introduces multiple build toolchains, and the functions are tightly coupled to AWS events and DynamoDB models, reducing portability.  Nevertheless, for a single bounded context this integration is pragmatic and keeps operational overhead low.

### Clean‑architecture influences

The core authentication logic is separated into small handlers that focus on business rules: verifying credentials, generating codes, issuing tokens and returning user attributes.  External concerns (HTTP request parsing, persistence and infrastructure) are pushed to the edges via environment variables and AWS SDK calls.  This separation echoes the spirit of clean architecture: placing business logic at the centre and keeping frameworks at arm’s length.  The repository also follows a clear package structure (`infra`, `app`, `web`, `tests`) which mirrors the conceptual layers.

From a purist’s standpoint, the handlers could be further decoupled from AWS by injecting interfaces for storage and encoding.  Shared models and pure functions could live in a domain layer independent of Lambda.  Yet such abstraction would add complexity without clear benefit in a small service.  The current design strikes a balance: it is simple enough to understand end‑to‑end yet modular enough to test in isolation.  The infrastructure code lives separately from the application code, which avoids cross‑contamination between layers.

### Conclusion

This OIDC provider exemplifies how a microservice can be packaged: one repository, one stack, one bounded domain.  It demonstrates many clean‑architecture principles while embracing serverless pragmatism.  By following the click‑through steps and exploring the directories, you can show how the infrastructure is defined, how the handlers implement the protocol flows and how automated tests verify behaviour.  The result is a lightweight yet complete service that can be deployed, tested and understood in a few minutes — ideal material for a lightning talk.
