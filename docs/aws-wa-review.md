AWS Well‑Architected Review for antonycc/oidc
The repository implements a lightweight OpenID Connect (OIDC) provider using AWS CDK (Java) for infrastructure and Node/ESM for runtime functions. Infrastructure is provisioned under infra and runtime code under app, suggesting the code targets a serverless architecture that minimizes operational overhead and cost. The review below aligns findings with the AWS Well‑Architected Framework pillars.
Operational Excellence
Operational excellence focuses on supporting development and running workloads effectively, gaining insight into operations and continually improving.
Strengths
Area	Evidence & Explanation
Clear Infrastructure‑as‑Code	The infrastructure is defined in CDK, enabling version control and repeatable deployments. The ObservabilityStack provisions a logs bucket, CloudTrail trail, X‑Ray group, metric filters and alarms for invalid authentication attempts and security events[1]. This demonstrates an intention to monitor authentication behaviour and support operational insight.
Structured Logging & Instrumentation	All runtime functions use a custom logger that masks sensitive fields and logs major events. The authorize function logs masked request parameters and errors[2], while the token function logs event fields and errors, ensuring traceability[3]. The custom EndpointFunction construct enables OpenTelemetry instrumentation by setting environment variables (AWS_LAMBDA_EXEC_WRAPPER, OTEL_RESOURCE_ATTRIBUTES etc.) for all Lambda functions[4].

Observability	CloudTrail records S3 and Lambda access, and metric filters create CloudWatch alarms for repeated authentication failures and multiple security events[1]. These alarms can trigger notifications via SNS or email, promoting proactive operational response.
CI/CD readiness	Separate stacks (DevStack, ProviderStack, ObservabilityStack) indicate readiness for multiple environments. Dockerfiles for Lambda runtimes allow building images during CI and pushing to ECR[5].

Areas for Improvement
1.	Runbooks and Automated Recovery – The repository defines alarms but does not include runbooks or automated remediation steps (e.g., AWS Systems Manager or Step Functions to mitigate repeated failures). Create runbooks or SSM Automation documents triggered by CloudWatch alarms to automatically disable clients or alert administrators.
2.	Operational Dashboards – While logs and metrics are collected, there are no dashboards. Use Amazon CloudWatch dashboards or third‑party observability platforms to visualize request rates, latencies, error rates, and DynamoDB capacity usage. Publishing metrics via AWS Lambda Powertools for Node.js would simplify this process.
3.	Testing & Deployment – The infra/test directory has minimal test coverage. For operational excellence, expand testing to include unit tests for CDK constructs and integration tests for API flows (e.g., can a client obtain an access token and call the userinfo endpoint?). Consider using AWS CDK assertions and integration tests with LocalStack or AWS SAM.
4.	Automated Rollback – The current deployment uses CDK RemovalPolicy.DESTROY on many resources, which could inadvertently delete data. Use RETAIN in production and define backups so rollbacks can be safe. Ensure deployments roll back automatically on failure (e.g., using CodeDeploy for Lambda versions or CodePipeline pipelines).
Security
Security is critical for an authentication provider. The repository demonstrates a number of secure practices but also contains areas that could be strengthened.
Strengths
Area	Evidence & Explanation
Least Privilege IAM	Each Lambda function receives a dedicated service role with the minimum policies necessary (DynamoDB table access, CloudWatch logs). The DevStack also grants ECR publish roles only necessary permissions[6].

Encryption at Rest	The S3 logs bucket uses server‑side encryption (SSE‑S3) and blocks public access[1]. DynamoDB tables use default SSE.

Secure Access Patterns	User authentication uses PKCE: the authorize function validates code_verifier/code_challenge and ensures scopes and client parameters are valid[7]. The token function verifies the authorization code, checks PKCE, and deletes codes to ensure one‑time use[8].

Sensitive Data Masking	Logging functions mask authorization codes, passwords, and other sensitive values before writing logs[2].

Time‑of‑Check/Use & TTL	DynamoDB tables use TTL for codes and refresh tokens, so expired data is removed automatically[9]. The token function conditionally deletes authorization codes to prevent replay[8].

Areas for Improvement
1.	Protecting Signing Keys – The private JWK used to sign ID and access tokens is stored in a DynamoDB item within the codes table; keys are generated on the fly if absent[10]. Comments mention that production should use S3/KMS. Storing signing keys in DynamoDB increases risk of exfiltration. Recommendation: Use AWS KMS for generating and managing RSA keys, or AWS Secrets Manager to store the private key securely and rotate it periodically. Manage JWKS via Amazon S3 with versioning so previous keys remain valid during rotation.
2.	Data Protection – The DynamoDB tables do not specify customer‑managed KMS keys or point‑in‑time recovery. Enabling PITR and specifying a KMS key improves data recovery and compliance. Additionally, enable S3 access logs to analyze access to the web bucket.
3.	Network Security – The API endpoints are publicly accessible via Lambda Function URLs attached to CloudFront behaviours with caching disabled[4]. Consider using AWS WAF on the CloudFront distribution to add rate limiting and rule sets to mitigate injection attacks. You could also use Lambda authorizers or require signed cookies for the distribution.
4.	Infrastructure Drift & Secrets – Secrets such as clients’ redirect URIs and allowed scopes appear to be encoded in the functions or environment variables. Use AWS Secrets Manager or Parameter Store to store client credentials and configuration parameters. Avoid storing secrets in code.
5.	Logging PII – While masking is used, ensure no personal data (e.g., user email, IP address) is logged in plain text. Use aws‑serverless‑js‑powertools to simplify secure logging and metrics.
Reliability
Reliability ensures workloads perform their functions correctly and consistently when expected. The repository leverages serverless services that inherently provide high availability, but some practices could be improved.
Strengths
Area	Evidence & Explanation
Highly Available Services	Use of S3, DynamoDB (on‑demand), CloudFront and Lambda ensures automatic scaling and high availability across multiple AZs without manual intervention.
TTL and Conditional Deletes	The token function deletes the authorization code in a conditional operation to prevent reuse[8]. DynamoDB TTL removes expired codes and refresh tokens automatically[9].

Backup Data	The code includes lifecycle rules to remove untagged ECR images after one day to keep repository clean[5]. This reduces clutter and helps reliability of deployments.
Areas for Improvement
1.	Resource Deletion Policies – Many resources (DynamoDB tables, S3 buckets) have removal policy DESTROY. For production, set removal policies to RETAIN or SNAPSHOT to avoid accidental data loss. Enable S3 versioning and cross‑region replication to avoid single‑region failures.
2.	Point‑in‑Time Recovery – DynamoDB tables do not enable PITR. Turning on PITR provides backup and restore capabilities if data is corrupted or accidentally deleted.
3.	Retries and Idempotency – Lambda functions rely on DynamoDB operations that might occasionally fail due to transient errors. Implement retries and idempotency. Use exponential backoff or AWS SDK automatic retries. Logging indicates some operations may fail and return error responses; consider sending events to DLQ or capturing them in EventBridge to manually retry.
4.	Multi‑Region Disaster Recovery – Currently, resources reside in a single region. For an identity provider, consider multi‑region deployments to reduce latency and provide business continuity if a region fails. Use DynamoDB global tables to replicate user and token tables across regions.
5.	Health Checks & Alarms – While ObservabilityStack sets metric filters and alarms for security events[1], no alarms exist for availability metrics (e.g., high 5xx rates, increased latency). Use CloudWatch metrics or embed custom metrics to alert when tokens cannot be issued, or DynamoDB throttling occurs. Combine with SNS to notify operations.
Performance Efficiency
This pillar relates to using computing resources efficiently. Because the workload is serverless, it inherits auto‑scaling and pay‑per‑use. However, there is room for optimization.
Strengths
Area	Evidence & Explanation
Serverless Architecture	Lambda functions with on‑demand DynamoDB minimize idle resources. The EndpointFunction sets memory to 256 MB and a 15‑second timeout[4], balancing performance and cost.

Client Side	The front end uses static web files served via S3 and CloudFront. This offloads heavy content and reduces dynamic calls.
Areas for Improvement
1.	Right‑Sizing Lambda – Monitor actual memory usage and adjust memory settings for each function. Setting memory too low increases cold start times; too high wastes money. Use Lambda Power Tuning or AWS Compute Optimizer to adjust memory and CPU.
2.	Caching – The CloudFront behaviours for API calls disable caching[4]. While dynamic token generation should not be cached, the .well-known/openid‑configuration and jwks endpoints could use caching with a TTL (e.g., 1 hour) to reduce Lambda invocations. Similarly, static files can have longer TTLs to improve latency.
3.	Database Access Patterns – The functions make multiple sequential DynamoDB calls (e.g., get user, put code, get code). Combining operations or using BatchGetItem could reduce latency. Evaluate adding secondary indexes if you need to query by user email or other attributes.
4.	Connection Re‑use – For Node Lambda functions, ensure the global DynamoDB client is reused across invocations to avoid overhead. The code seems to instantiate clients within modules; confirm that aws-sdk is imported outside the handler scope for connection reuse.
5.	Warm Starts – Use Provisioned Concurrency or scheduled pings for critical endpoints to minimize cold starts during peak traffic.
Cost Optimization
Cost optimization examines whether the workload delivers business value at the lowest price point. The repository already implements a number of cost‑conscious practices.
Strengths
Area	Evidence & Explanation
On‑Demand Billing	DynamoDB uses on‑demand capacity mode and pay‑per‑request CloudFront and Lambda pricing, which scales with demand and avoids paying for idle resources[9].

Lifecycle Policies	The logs bucket uses a 1‑day retention for CloudTrail logs and deletes objects automatically[1]. ECR images have lifecycle rules removing untagged images after one day[5]. Such practices prevent uncontrolled storage growth.
Areas for Improvement
1.	Reserved Concurrency & Savings Plans – For predictable workloads, evaluate using Lambda Savings Plans or reserved concurrency to reduce cost. If usage spikes unpredictably, continue with on‑demand.
2.	Data Transfer – CloudFront distribution uses the cheapest price class by default; consider using price class 100/200 to limit edge locations and reduce data transfer costs if global coverage is unnecessary. Configure CloudFront logging to analyze usage patterns.
3.	Right‑Sized Logging – Short retention time for logs reduces storage cost but may hamper forensic analysis; balance retention with compliance requirements. Use AWS log subscriptions to send logs to a central aggregator for longer retention.
4.	Spot for Build Containers – Build and CI jobs could use EC2 Spot Instances or Fargate Spot to reduce ECR build costs. Evaluate caching layers and optimizing bundling to reduce container build times.
Sustainability (Optional)
AWS introduced sustainability as a cross‑cutting pillar. Using managed services is inherently more sustainable because AWS can achieve higher resource utilization. However, there are areas to further reduce carbon footprint:
1.	Efficient Runtime – Choose Graviton‑based architectures (arm64) for Lambda to reduce energy consumption and cost. Monitor memory and CPU usage to avoid over‑provisioning.
2.	Data Pruning – The system already uses TTL and short log retention, which reduces storage and thus carbon footprint.
3.	Region Selection – Deploy to regions with higher renewable energy in AWS’s portfolio, such as eu‑north‑1 or eu‑west‑3, if latency requirements permit.
Summary of Recommended Actions
Pillar	Key Recommendations
Operational Excellence	Define runbooks/automations for alarms; build CloudWatch dashboards; increase test coverage; use safe removal policies; automate deployments with rollback; use AWS Lambda Powertools for logging/metrics.
Security	Move signing keys to KMS or Secrets Manager; enable DynamoDB PITR and KMS encryption; apply WAF rules to CloudFront; store client secrets in Secrets Manager/Parameter Store; use secure logging practices; consider using AWS Identity and Access Management (IAM) for clients instead of storing secrets manually.
Reliability	Change resource removal policies to RETAIN; enable DynamoDB PITR and S3 versioning; implement retries and DLQs for function failures; consider multi‑region deployment; add availability alarms.
Performance	Right‑size Lambda memory; add caching for .well-known and jwks; optimize DynamoDB access patterns; reuse connections; consider provisioned concurrency.
Cost Optimization	Evaluate Savings Plans and reserved concurrency; use price class 100/200 for CloudFront; refine log retention; use Spot instances for builds.
Sustainability	Migrate to Graviton processors; prune data; consider region energy profiles.
By addressing these recommendations, the OIDC provider can better align with the AWS Well‑Architected Framework and deliver a secure, reliable, and efficient identity service.
 
[1] GitHub
https://github.com/antonycc/oidc/blob/main/infra/main/java/com/antonycc/oidc/ObservabilityStack.java
[2] [7] GitHub
https://github.com/antonycc/oidc/blob/main/app/functions/authorize.mjs
[3] [8] GitHub
https://github.com/antonycc/oidc/blob/main/app/functions/token.mjs
[4] GitHub
https://github.com/antonycc/oidc/blob/main/infra/main/java/com/antonycc/oidc/EndpointFunction.java
[5] [6] GitHub
https://github.com/antonycc/oidc/blob/main/infra/main/java/com/antonycc/oidc/DevStack.java
[9] GitHub
https://github.com/antonycc/oidc/blob/main/infra/main/java/com/antonycc/oidc/ProviderStack.java
[10] GitHub
https://github.com/antonycc/oidc/blob/main/app/lib/crypto.mjs
<img width="468" height="621" alt="image" src="https://github.com/user-attachments/assets/628aac46-d448-4162-b59e-c3b969279b52" />
