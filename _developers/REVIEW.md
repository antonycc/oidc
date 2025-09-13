# ChatGPT approximation of a AWS Well‑Architected Review of antonycc/oidc OIDC Provider

## Introduction

The **AWS Well‑Architected Framework (WAF)** provides guidance for building secure, high‑performing, resilient and
cost‑efficient cloud workloads. As of **April 2025**, AWS released a new version of the framework lens; assessments
created from 9 April 2025 automatically use the updated lens and some existing best‑practice IDs and risk severities
were renamed or
merged[\[1\]](https://support.montycloud.com/support/solutions/articles/62000234155-aws-well-architected-lens-update-april-9-2025-support-article#:~:text=AWS%20recently%20released%20a%20new,which%20contains%20the%20following%20updates).
The framework is organised into six pillars; this report focuses on the **security** and **cost optimisation** pillars
as they are most relevant for a zero‑cost‑at‑rest goal.

### Latest published guidance

- **Security pillar design principles:** Recent guidance emphasises creating a **strong identity foundation**, enabling
  **traceability**, applying **security at all layers**, **automating security best practices** and **protecting data in
  transit and at rest
  **[\[2\]](https://www.cloud4c.com/blogs/six-pillars-of-aws-well-architected-framework#:~:text=The%20Security%20pillar%20emphasizes%20protecting,Key%20focus%20areas%20include).
  AWS services such as IAM, CloudTrail, GuardDuty and KMS are commonly used to implement these
  controls[\[3\]](https://www.cloud4c.com/blogs/six-pillars-of-aws-well-architected-framework#:~:text=A%20financial%20services%20company%2C%20for,for%20encryption%20key%20management).
- **Cost optimisation principles:** Well‑Architected advises implementing _cloud financial management_, adopting a *
  *consumption‑based** model, measuring and optimising efficiency, stopping _undifferentiated heavy lifting_ and
  analysing
  spending[\[4\]](https://www.cloud4c.com/blogs/six-pillars-of-aws-well-architected-framework#:~:text=Pillar%205%3A%20Cost%20Optimization).
  Serverless services like AWS Lambda help achieve **pay‑per‑use** billing; a July 2025 article notes that in serverless
  architectures “you only pay for what you use…there are no idle server costs; billing is based on execution time and
  resource
  usage”[\[5\]](https://baniwalinfotech.com/serverless-architecture-in-web-app-development/#:~:text=With%20serverless%2C%20you%20only%20pay,serve%20traffic%20instantly%20when%20needed).
  Small workloads built on Lambda can operate at **near‑zero cost when idle
  **[\[5\]](https://baniwalinfotech.com/serverless-architecture-in-web-app-development/#:~:text=With%20serverless%2C%20you%20only%20pay,serve%20traffic%20instantly%20when%20needed),
  aligning with the zero‑cost‑at‑rest goal.
- **Encryption and key management:** AWS recommends encrypting all sensitive data using your own encryption keys; AWS
  Key Management Service (KMS) offers **customer‑managed**, **AWS‑managed** and **AWS‑owned**
  keys[\[6\]](https://k21academy.com/amazon-web-services/amazon-aws-key-management-service-kms/#:~:text=KMS%20keys%20that%20an%20AWS,to%20secure%20resources%20that%20are)[\[7\]](https://cloudericks.com/blog/understanding-aws-kms-keys-customer-keys-and-aws-keys/#:~:text=AWS,their%20usage%20in%20CloudTrail%20logs).
  AWS‑owned keys are **free** (no monthly or usage
  fees)[\[6\]](https://k21academy.com/amazon-web-services/amazon-aws-key-management-service-kms/#:~:text=KMS%20keys%20that%20an%20AWS,to%20secure%20resources%20that%20are)[\[8\]](https://cloudericks.com/blog/understanding-aws-kms-keys-customer-keys-and-aws-keys/#:~:text=,Varies%20across%20different%20AWS%20services),
  whereas customer‑managed keys incur a monthly fee and per‑request
  charges[\[9\]](https://cloudericks.com/blog/understanding-aws-kms-keys-customer-keys-and-aws-keys/#:~:text=%2A%20Pricing%3A%20Customer,recorded%20as%20events%20in%20CloudTrail).
  Selecting AWS‑owned keys therefore supports the zero‑cost‑at‑rest objective while still providing encryption at rest.

## Repository overview

The antonycc/oidc project is a **serverless** OIDC provider built with AWS CDK (Java) and Node.js Lambda functions. Its
stated goal is a _cheap, inspectable_ identity provider for tests and small workloads. Key architectural features
include:

1. **Infrastructure defined in CDK:** The Java CDK app defines three stacks:
   - ObservabilityStack: S3 logs bucket, CloudTrail and X-Ray group
   - DevStack: ECR repository and publishing role for images
   - AppStack: S3 buckets (Web and WellKnown), CloudFront distribution, Lambda Function URL integrations for `/authorize`, `/token`, `/userinfo` and `/jwks`, and Route53 alias
   Buckets block public access, enforce TLS, auto-delete objects and are destroyed with the stack. CloudFront routes static paths to S3 and OIDC paths to Lambda Function URLs with logging and IPv6 enabled.
2. **Pay‑per‑request resources:** Three DynamoDB tables (Users, AuthCodes and RefreshTokens) use on‑demand billing with TTLs for short‑lived data. Lambda functions run on Node.js 22 with modest memory, short timeouts and seven‑day log retention. Function URLs use NONE auth and are exposed only via CloudFront; the distribution is explicitly permitted to invoke them.
3. **OIDC flow implementation:**
4. _Authorize endpoint:_ validates required query parameters; if USERS_TABLE is defined, it fetches the user record from
   DynamoDB and returns 401 if the user is unknown; otherwise it issues an authorization code using ulid(), stores it
   with a TTL and redirects the
   client[\[17\]](https://raw.githubusercontent.com/antonycc/oidc/main/app/oidc/src/authorize.mjs#:~:text=const%20req%20%3D%20,400%2C%20%27unsupported).
5. _Token endpoint:_ only accepts POST requests; verifies the PKCE code challenge, deletes the authorization code,
   generates an RSA key pair on cold start, signs ID and access tokens (expiry 5 minutes) and stores a refresh token in
   DynamoDB with 24 h
   TTL[\[18\]](https://raw.githubusercontent.com/antonycc/oidc/main/app/oidc/src/token.mjs#:~:text=const%20row%20%3D%20await%20get%28tables,error%3A%20%27invalid_grant%27)[\[19\]](https://raw.githubusercontent.com/antonycc/oidc/main/app/oidc/src/crypto.mjs#:~:text=%2F%2F%20Ephemeral%20keypair%20per%20cold,1).
6. _UserInfo endpoint:_ contains a hard‑coded map of access tokens to user profiles and does not verify the JWT
   signature or
   expiry[\[20\]](https://raw.githubusercontent.com/antonycc/oidc/main/app/oidc/src/userinfo.mjs#:~:text=%2F%2F%20Simple%20in,).
7. _JWKS and discovery:_ static files under well‑known define the OpenID configuration and a placeholder JWKS with a
   fixed
   kid[\[21\]](https://raw.githubusercontent.com/antonycc/oidc/main/well-known/openid-configuration#:~:text=%7B%20,S256).
   The key values are not updated when the Lambda generates new keys.
8. **Deployment pipeline:** GitHub Actions uses OIDC to assume an AWS role, synthesises and deploys the CDK stack,
   provisions a test user and runs Playwright behaviour tests. Logs are retained for seven days and resources are
   destroyed on stack deletion, supporting minimal ongoing cost.

## Well‑Architected Review – Security and Zero‑Cost‑at‑Rest

The following evaluation aligns the repository against the security and cost principles above. Each area notes
observations, potential risks and how the design fares relative to typical open‑source projects.

### Identity and access management

- **IAM roles and least privilege** – The deployment instructions advise creating an IAM role for GitHub Actions with
  minimal policies for CloudFormation, S3, CloudFront, DynamoDB and Cognito. CloudFront is explicitly granted permission
  to invoke the Lambda function
  URLs[\[16\]](https://github.com/antonycc/oidc/blob/main/infra/main/java/com/antonycc/oidc/OidcStack.java#L288-L298).
  However, the application’s Lambda functions themselves run with default execution roles; no explicit IAM policies
  restrict DynamoDB table access to the specific tables. The open **Function URLs** use NONE
  authentication[\[15\]](https://github.com/antonycc/oidc/blob/main/infra/main/java/com/antonycc/oidc/OidcStack.java#L216-L227),
  relying on CloudFront path routing for exposure control; but if the CloudFront distribution were misconfigured, the
  functions could be invoked publicly. Typical open‑source OIDC providers secure internal functions with IAM authorisers
  or API Gateway with JWT authorisation; the reliance on Function URLs is less common and increases risk if
  misconfigured.
- **User authentication** – The authorize function accepts a username and optional password, but it does not validate
  the password; it only checks that a DynamoDB user record
  exists[\[22\]](https://raw.githubusercontent.com/antonycc/oidc/main/app/oidc/src/authorize.mjs#:~:text=const%20req%20%3D%20,400%2C%20%27unsupported).
  This could allow unauthenticated access with any password. In production, user identity should be delegated to Cognito
  or validated against hashed credentials. Furthermore, the UserInfo function does not verify the bearer token signature
  and uses an in‑memory map of valid
  tokens[\[20\]](https://raw.githubusercontent.com/antonycc/oidc/main/app/oidc/src/userinfo.mjs#:~:text=%2F%2F%20Simple%20in,),
  which is insecure and unsuitable for multi‑instance deployments.
- **Key management** – JWTs are signed with an RSA key pair generated on each cold start; keys are not persisted and a
  static placeholder JWKS is
  served[\[19\]](https://raw.githubusercontent.com/antonycc/oidc/main/app/oidc/src/crypto.mjs#:~:text=%2F%2F%20Ephemeral%20keypair%20per%20cold,1)[\[21\]](https://raw.githubusercontent.com/antonycc/oidc/main/well-known/openid-configuration#:~:text=%7B%20,S256).
  Clients cannot verify tokens across cold starts, and there is no rotation schedule. A production‑ready design would
  generate a key pair once, store it encrypted (e.g., in S3 or Secrets Manager), rotate it periodically and publish the
  live public key in the JWKS. Using AWS‑owned keys (e.g., SSE‑S3 and DynamoDB default encryption) is
  free[\[6\]](https://k21academy.com/amazon-web-services/amazon-aws-key-management-service-kms/#:~:text=KMS%20keys%20that%20an%20AWS,to%20secure%20resources%20that%20are)[\[8\]](https://cloudericks.com/blog/understanding-aws-kms-keys-customer-keys-and-aws-keys/#:~:text=,Varies%20across%20different%20AWS%20services)
  and aligns with zero‑cost‑at‑rest, whereas storing secrets in Secrets Manager or KMS would incur per‑use charges.

### Logging, monitoring and detection

Each Lambda has its own CloudWatch **log group** with a seven‑day retention and removal policy
destroy[\[23\]](https://github.com/antonycc/oidc/blob/main/infra/main/java/com/antonycc/oidc/OidcStack.java#L168-L172)[\[14\]](https://github.com/antonycc/oidc/blob/main/infra/main/java/com/antonycc/oidc/OidcStack.java#L188-L211).
Verbose logs are emitted for every request and include query parameters. While logging aids traceability (a key security
principle[\[2\]](https://www.cloud4c.com/blogs/six-pillars-of-aws-well-architected-framework#:~:text=The%20Security%20pillar%20emphasizes%20protecting,Key%20focus%20areas%20include)),
sensitive data such as passwords and authorization codes are logged in plain text. Open‑source projects typically avoid
logging secrets and use structured logs with redaction. For minimal cost at rest, shorter retention (e.g., one day) and
lower log volume would reduce CloudWatch charges.

### Data protection and infrastructure security

- **Encryption at rest** – The stack does not explicitly enable encryption on the S3 buckets or DynamoDB tables. By
  default S3 will encrypt data using AWS‑managed keys (SSE‑S3), and DynamoDB always encrypts table data using AWS‑owned
  keys. Explicitly enabling SSE‑S3 ensures the bucket cannot accidentally be created unencrypted and still incurs **zero
  cost
  **[\[6\]](https://k21academy.com/amazon-web-services/amazon-aws-key-management-service-kms/#:~:text=KMS%20keys%20that%20an%20AWS,to%20secure%20resources%20that%20are).
  Using customer‑managed KMS keys would add per‑key and per‑request
  costs[\[9\]](https://cloudericks.com/blog/understanding-aws-kms-keys-customer-keys-and-aws-keys/#:~:text=%2A%20Pricing%3A%20Customer,recorded%20as%20events%20in%20CloudTrail)
  and contradict the zero‑cost‑at‑rest goal.
- **Network security** – Buckets have public access blocked and use **Origin Access Identity** to restrict CloudFront
  access[\[10\]](https://github.com/antonycc/oidc/blob/main/infra/main/java/com/antonycc/oidc/OidcStack.java#L91-L105).
  CloudFront enforces HTTPS and redirects HTTP
  requests[\[24\]](https://github.com/antonycc/oidc/blob/main/infra/main/java/com/antonycc/oidc/OidcStack.java#L107-L114).
  However, Function URLs are publicly reachable if the CloudFront distribution is bypassed, and the Lambda functions
  themselves have no VPC or security group restrictions. A more secure design would place the functions behind API
  Gateway with IAM‑based authorisation or restrict Function URL access via an authorization type.
- **Data retention** – DynamoDB tables for AuthCodes and RefreshTokens configure TTL attributes so records expire
  automatically[\[12\]](https://github.com/antonycc/oidc/blob/main/infra/main/java/com/antonycc/oidc/OidcStack.java#L144-L160).
  The Users table lacks TTL; user entries persist indefinitely unless manually deleted. For demonstration purposes this
  is acceptable, but multi‑tenant SaaS use would require per‑tenant partitioning and lifecycle policies.

### Application security

The OIDC implementation covers the basic PKCE flow but omits important validation:

- **Password validation** is absent; any password is
  accepted[\[22\]](https://raw.githubusercontent.com/antonycc/oidc/main/app/oidc/src/authorize.mjs#:~:text=const%20req%20%3D%20,400%2C%20%27unsupported).
- **Client authentication** is not enforced; the client_id is not verified against a registered list. The README notes
  that the Cognito User Pool is configured to federate to this provider, but the provider does not validate the
  client_id or redirect_uri against a whitelist.
- **Token verification** is delegated to the client. The UserInfo endpoint ignores the access_token signature and simply
  maps a token string to a
  user[\[20\]](https://raw.githubusercontent.com/antonycc/oidc/main/app/oidc/src/userinfo.mjs#:~:text=%2F%2F%20Simple%20in,),
  undermining the trust model.
- **Cross‑site scripting and injection** – the authorize endpoint constructs an HTML login form by embedding query
  parameters directly into hidden fields without HTML escaping for
  values[\[25\]](https://raw.githubusercontent.com/antonycc/oidc/main/app/oidc/src/authorize.mjs#:~:text=const%20hidden%20%3D%20Object.entries%28qp%29.map%28%28%5Bk%2Cv%5D%29%20%3D,label).
  Although there is an escapeHtml function in the source, it is not used for query parameters. A malicious redirect_uri
  could inject arbitrary HTML into the login page.
- **Error handling** – unhandled exceptions are returned as a generic 500 but errors are logged along with stack traces;
  this may leak internal details to logs.

### Cost optimisation

The project heavily embraces **serverless** and **pay‑per‑request** resources: on‑demand DynamoDB tables, S3 behind
CloudFront and short‑lived Lambda executions. According to AWS cost guidance, serverless functions allow you to “pay
only for what you use” and have no idle server
costs[\[5\]](https://baniwalinfotech.com/serverless-architecture-in-web-app-development/#:~:text=With%20serverless%2C%20you%20only%20pay,serve%20traffic%20instantly%20when%20needed),
enabling near‑zero cost when the system is idle. Deleting the CloudFormation stack destroys the buckets, tables and
functions and therefore eliminates storage costs. Some areas could further reduce cost:

- **Log retention and verbosity** – CloudWatch Logs incur charges for ingestion and storage; seven‑day retention and
  verbose console.log calls may create unnecessary cost. Reducing retention to one day or using log sampling would lower
  cost while retaining essential traceability.
- **Static JWKS** – Serving JWKS from S3 is cost‑effective; however the placeholder key means tokens cannot be
  validated. Generating and publishing real keys (perhaps stored in an S3 object) would incur only minimal S3 costs (
  pennies per month) while dramatically improving security. Publishing JWKS through CloudFront ensures caching and
  reduces request charges.
- **User store** – Storing users in DynamoDB incurs storage cost; for testing it may be negligible. For a multi‑tenant
  SaaS offering, you would likely integrate with Cognito user pools instead, avoiding the cost of a custom user store.

### Overall outcome

The design shows strong adherence to **pay‑per‑use** and infrastructure‑as‑code principles. Using Lambda Function URLs,
on‑demand DynamoDB tables, S3 with auto‑delete and short log retention generally achieves **near‑zero cost at rest**.
However, the implementation is intentionally minimal and omits several essential security controls. Compared with
typical open‑source OIDC providers (e.g., ORY Hydra or Dex), which validate clients, authenticate users, persist keys
and implement proper JWKS endpoints, this solution is closer to a demonstration. Its lack of password verification,
static JWKS, dynamic key generation and insecure UserInfo endpoint would be considered high‑risk in a production review.
On the other hand, the simplicity and small code base mean that improvements have a very favourable **impact‑to‑cost**
ratio; many can be implemented in a few lines of CDK or Node code.

## Recommended improvements (ranked by impact‑to‑cost ratio)

The following recommendations are grouped by theme and ranked by the ratio of expected improvement to implementation
cost. A **high impact** means the change closes a critical security gap or significantly improves compliance with the
Well‑Architected principles, while **low cost** indicates that the change can be implemented with modest code changes or
configuration updates (for example, adding ~20 lines of CDK or Node code).

### 1\. Identity & authentication

| Recommendation                                 | Rationale                                                                                                                                                                                                                                                                 | Impact vs. cost                                                                                                                                                                                    |
|------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Enforce client and redirect URI validation** | Maintain a list of registered client_id and allowed redirect_uri values (possibly in an SSM Parameter or small DynamoDB table) and verify them in the authorize and token handlers. This prevents malicious clients from using the provider for open redirection attacks. | **High impact / Low cost:** Implementing parameter checks and a simple registry adds ~20 lines of code and eliminates a class of abuse.                                                            |
| **Validate user credentials**                  | Replace the current username‑only check with password verification, e.g., by storing hashed passwords in the Users table or delegating authentication to the Cognito user pool. If using Cognito, remove the custom Users table entirely.                                 | **High impact / Medium cost:** Integrating with Cognito offloads credential storage and uses built‑in MFA and security features. It requires additional CDK constructs but reduces custom code.    |
| **Use IAM authorizers or API Gateway**         | Instead of exposing Lambda Function URLs publicly, place the API behind API Gateway or CloudFront with Lambda@Edge and configure IAM or JWT authorisation. This allows fine‑grained control and rate limiting.                                                            | **High impact / Medium cost:** Adding API Gateway is a few lines of CDK but may introduce minimal request costs. It significantly improves access control and monitoring.                          |
| **Persist and rotate signing keys**            | Generate an RSA key pair once (e.g., during deployment), store it encrypted in S3 using SSE‑S3 (free) and implement rotation via a scheduled Lambda. Update the JWKS file automatically.                                                                                  | **High impact / Low cost:** Storing a small key file in S3 costs pennies per month and avoids per‑key KMS fees; code changes (~30 lines) to load the key dramatically improve token verifiability. |

### 2\. Data protection

| Recommendation                                  | Rationale                                                                                                                                                                                                                                                                                                                                                                            | Impact vs. cost                                                                                                           |
|-------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------|
| **Enable server‑side encryption on S3 buckets** | Explicitly set encryption: s3.ServerSideEncryption.AES_256 or BucketEncryption.S3_MANAGED on the WebBucket and WellKnownBucket to ensure encryption at rest. AWS‑managed keys (SSE‑S3) incur no additional cost[\[6\]](https://k21academy.com/amazon-web-services/amazon-aws-key-management-service-kms/#:~:text=KMS%20keys%20that%20an%20AWS,to%20secure%20resources%20that%20are). | **High impact / Zero cost:** One line of CDK ensures compliance with encryption requirements without affecting cost.      |
| **Use HTTPS for JWKS and discovery**            | Ensure the jwks.json and openid-configuration files are served via HTTPS with proper Cache-Control headers. Consider moving jwks.json to S3 and updating it when keys rotate.                                                                                                                                                                                                   | **Medium impact / Low cost:** Improves trust and caching.                                                                 |
| **Sanitize user‑supplied values**               | Escape HTML in the login form and query parameters to prevent XSS injection[\[25\]](https://raw.githubusercontent.com/antonycc/oidc/main/app/oidc/src/authorize.mjs#:~:text=const%20hidden%20%3D%20Object.entries%28qp%29.map%28%28%5Bk%2Cv%5D%29%20%3D,label). Use libraries like he or escape user input manually.                                                                 | **Medium impact / Low cost:** A few lines of code prevent cross‑site scripting.                                           |
| **Reduce secret exposure in logs**              | Avoid logging sensitive query parameters such as password, code, code_verifier or tokens. Use structured logging and mask values.                                                                                                                                                                                                                                                    | **Medium impact / Low cost:** Removing or masking logs reduces the risk of secret leakage and lowers log ingestion costs. |

### 3\. Monitoring and incident response

| Recommendation                                 | Rationale                                                                                                                                                                                                                                                                                                                                             | Impact vs. cost                                                                                                            |
|------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------|
| **Enable AWS CloudTrail and configure alarms** | Use CloudTrail (free for management events) to record IAM and Lambda API calls and set up alarms for unusual activity. CloudTrail aligns with the traceability principle[\[2\]](https://www.cloud4c.com/blogs/six-pillars-of-aws-well-architected-framework#:~:text=The%20Security%20pillar%20emphasizes%20protecting,Key%20focus%20areas%20include). | **High impact / Zero–low cost:** Management events are logged free; data events may incur cost but are optional.           |
| **Shorten log retention or use log filtering** | Reduce CloudWatch retention from seven days to one or two days and filter out verbose logs. Consider exporting logs to S3 for long‑term analysis if required.                                                                                                                                                                                         | **Medium impact / Low cost:** Cuts CloudWatch charges without sacrificing necessary traceability.                          |
| **Add metrics and alarms for error rates**     | Instrument the Lambda functions to publish custom metrics (e.g., authentication errors, invalid grants) and create alarms when anomalies occur. This supports rapid incident response.                                                                                                                                                                | **Medium impact / Low cost:** A few lines of code and CDK to publish metrics; CloudWatch custom metrics have minimal cost. |

### 4\. Architecture and cost optimisation

| Recommendation                                           | Rationale                                                                                                                                                                                          | Impact vs. cost                                                                                                                           |
|----------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------|
| **Integrate with Cognito fully**                         | Offload user management to Cognito rather than maintaining a custom Users table. Cognito user pool charges are per‑MAU and include secure authentication, reducing custom code and DynamoDB costs. | **High impact / Medium cost:** Simplifies the stack and enhances security; cost depends on monthly active users but remains zero at rest. |
| **Partition DynamoDB by tenant and enable TTL on Users** | If multi‑tenant SaaS is planned, partition the Users table by tenant ID and add a TTL attribute to remove inactive accounts.                                                                       | **Medium impact / Low cost:** Improves scalability and cost allocation; TTL reduces storage cost.                                         |
| **Adopt infrastructure upgrades**                        | Move from Function URLs to ALB or API Gateway if features such as throttling, WAF rules or caching are required. Use caching for the discovery documents to reduce Lambda invocations.             | **Medium impact / Medium cost:** Adds some complexity and minimal cost per request but improves security and observability.               |
| **Publish as a reusable CDK construct**                  | Package the stack as a CDK construct or SaaS offering with environment‑based configuration. Document cost expectations and recommended quotas (e.g., for monthly active users).                    | **Medium impact / Medium cost:** Promotes reuse and clarity; development effort is non‑trivial but beneficial for the community.          |

## Conclusion

The antonycc/oidc repository demonstrates a lightweight OIDC provider built exclusively on serverless AWS services. It
meets the **zero‑cost‑at‑rest** goal by relying on pay‑per‑request resources (Lambda, DynamoDB, S3) and by destroying
all resources on stack
deletion[\[10\]](https://github.com/antonycc/oidc/blob/main/infra/main/java/com/antonycc/oidc/OidcStack.java#L91-L105)[\[12\]](https://github.com/antonycc/oidc/blob/main/infra/main/java/com/antonycc/oidc/OidcStack.java#L144-L160).
However, from a security perspective the implementation lacks critical controls: credential validation, client
whitelisting, persistent key management, proper JWKS publication and sanitisation. The Well‑Architected security pillar
emphasises strong identity foundations, traceability, layered security, automation and protecting data at rest and in
transit[\[2\]](https://www.cloud4c.com/blogs/six-pillars-of-aws-well-architected-framework#:~:text=The%20Security%20pillar%20emphasizes%20protecting,Key%20focus%20areas%20include);
many of these are absent or only partially implemented here. The cost optimisation pillar encourages a consumption model
and efficient resource
usage[\[4\]](https://www.cloud4c.com/blogs/six-pillars-of-aws-well-architected-framework#:~:text=Pillar%205%3A%20Cost%20Optimization);
the project aligns well with this principle by using serverless services and on‑demand billing. Implementing the
recommended improvements—most of which require modest changes—would significantly raise the security posture without
compromising the zero‑cost‑at‑rest objective.

[\[1\]](https://support.montycloud.com/support/solutions/articles/62000234155-aws-well-architected-lens-update-april-9-2025-support-article#:~:text=AWS%20recently%20released%20a%20new,which%20contains%20the%20following%20updates)
AWS Well-Architected Lens Update (April 9, 2025) - Support Article : Customer Support Portal

<https://support.montycloud.com/support/solutions/articles/62000234155-aws-well-architected-lens-update-april-9-2025-support-article>

[\[2\]](https://www.cloud4c.com/blogs/six-pillars-of-aws-well-architected-framework#:~:text=The%20Security%20pillar%20emphasizes%20protecting,Key%20focus%20areas%20include) [\[3\]](https://www.cloud4c.com/blogs/six-pillars-of-aws-well-architected-framework#:~:text=A%20financial%20services%20company%2C%20for,for%20encryption%20key%20management) [\[4\]](https://www.cloud4c.com/blogs/six-pillars-of-aws-well-architected-framework#:~:text=Pillar%205%3A%20Cost%20Optimization)
Understanding 6 Pillars of AWS Well-Architected Framework

<https://www.cloud4c.com/blogs/six-pillars-of-aws-well-architected-framework>

[\[5\]](https://baniwalinfotech.com/serverless-architecture-in-web-app-development/#:~:text=With%20serverless%2C%20you%20only%20pay,serve%20traffic%20instantly%20when%20needed)
Serverless Architecture in Web App Development: Benefits & Challenges

<https://baniwalinfotech.com/serverless-architecture-in-web-app-development/>

[\[6\]](https://k21academy.com/amazon-web-services/amazon-aws-key-management-service-kms/#:~:text=KMS%20keys%20that%20an%20AWS,to%20secure%20resources%20that%20are)
What is AWS Key Management Service (AWS KMS)?

<https://k21academy.com/amazon-web-services/amazon-aws-key-management-service-kms/>

[\[7\]](https://cloudericks.com/blog/understanding-aws-kms-keys-customer-keys-and-aws-keys/#:~:text=AWS,their%20usage%20in%20CloudTrail%20logs) [\[8\]](https://cloudericks.com/blog/understanding-aws-kms-keys-customer-keys-and-aws-keys/#:~:text=,Varies%20across%20different%20AWS%20services) [\[9\]](https://cloudericks.com/blog/understanding-aws-kms-keys-customer-keys-and-aws-keys/#:~:text=%2A%20Pricing%3A%20Customer,recorded%20as%20events%20in%20CloudTrail)
Understanding AWS KMS Keys - Customer Keys and AWS Keys - The Cloudericks Portal

<https://cloudericks.com/blog/understanding-aws-kms-keys-customer-keys-and-aws-keys/>

[\[10\]](https://github.com/antonycc/oidc/blob/main/infra/main/java/com/antonycc/oidc/OidcStack.java#L91-L105) [\[11\]](https://github.com/antonycc/oidc/blob/main/infra/main/java/com/antonycc/oidc/OidcStack.java#L281-L285) [\[12\]](https://github.com/antonycc/oidc/blob/main/infra/main/java/com/antonycc/oidc/OidcStack.java#L144-L160) [\[13\]](https://github.com/antonycc/oidc/blob/main/infra/main/java/com/antonycc/oidc/OidcStack.java#L168-L176) [\[14\]](https://github.com/antonycc/oidc/blob/main/infra/main/java/com/antonycc/oidc/OidcStack.java#L188-L211) [\[15\]](https://github.com/antonycc/oidc/blob/main/infra/main/java/com/antonycc/oidc/OidcStack.java#L216-L227) [\[16\]](https://github.com/antonycc/oidc/blob/main/infra/main/java/com/antonycc/oidc/OidcStack.java#L288-L298) [\[23\]](https://github.com/antonycc/oidc/blob/main/infra/main/java/com/antonycc/oidc/OidcStack.java#L168-L172) [\[24\]](https://github.com/antonycc/oidc/blob/main/infra/main/java/com/antonycc/oidc/OidcStack.java#L107-L114)
GitHub

<https://github.com/antonycc/oidc/blob/main/infra/main/java/com/antonycc/oidc/OidcStack.java>

[\[17\]](https://raw.githubusercontent.com/antonycc/oidc/main/app/oidc/src/authorize.mjs#:~:text=const%20req%20%3D%20,400%2C%20%27unsupported) [\[22\]](https://raw.githubusercontent.com/antonycc/oidc/main/app/oidc/src/authorize.mjs#:~:text=const%20req%20%3D%20,400%2C%20%27unsupported) [\[25\]](https://raw.githubusercontent.com/antonycc/oidc/main/app/oidc/src/authorize.mjs#:~:text=const%20hidden%20%3D%20Object.entries%28qp%29.map%28%28%5Bk%2Cv%5D%29%20%3D,label)
raw.githubusercontent.com

<https://raw.githubusercontent.com/antonycc/oidc/main/app/oidc/src/authorize.mjs>

[\[18\]](https://raw.githubusercontent.com/antonycc/oidc/main/app/oidc/src/token.mjs#:~:text=const%20row%20%3D%20await%20get%28tables,error%3A%20%27invalid_grant%27)
raw.githubusercontent.com

<https://raw.githubusercontent.com/antonycc/oidc/main/app/oidc/src/token.mjs>

[\[19\]](https://raw.githubusercontent.com/antonycc/oidc/main/app/oidc/src/crypto.mjs#:~:text=%2F%2F%20Ephemeral%20keypair%20per%20cold,1)
raw.githubusercontent.com

<https://raw.githubusercontent.com/antonycc/oidc/main/app/oidc/src/crypto.mjs>

[\[20\]](https://raw.githubusercontent.com/antonycc/oidc/main/app/oidc/src/userinfo.mjs#:~:text=%2F%2F%20Simple%20in,)
raw.githubusercontent.com

<https://raw.githubusercontent.com/antonycc/oidc/main/app/oidc/src/userinfo.mjs>

[\[21\]](https://raw.githubusercontent.com/antonycc/oidc/main/well-known/openid-configuration#:~:text=%7B%20,S256)
raw.githubusercontent.com

<https://raw.githubusercontent.com/antonycc/oidc/main/well-known/openid-configuration>
