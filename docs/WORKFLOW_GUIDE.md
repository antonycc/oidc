# GitHub Actions Workflow Guide

This document explains the deployment workflow, parameters, outputs, and troubleshooting for the OIDC provider.

## Workflow Overview

The `deploy.yml` workflow handles building, testing, and deploying the OIDC provider across different environments:

- **Production**: Triggered on `main` branch pushes
- **CI/Testing**: Triggered on feature branch pushes or manual dispatch
- **Scheduled**: Daily validation runs at 04:23 UTC

## Trigger Conditions

### Automatic Triggers

**Push to any branch:**
```yaml
push:
  branches: ['**', '!gh_pages']
  paths: ['.github/workflows/deploy.yml', 'app/**', 'infra/**', 'tests/**', 'web/**', 'well-known/**', '.env.ci', '.env.prod', 'cdk.json', 'Dockerfile', 'package.json', 'package-lock.json', 'pom.xml']
```

**Daily schedule:**
```yaml
schedule:
  - cron: '23 4 * * *'  # 04:23 UTC daily
```

### Manual Dispatch

Use workflow dispatch for custom deployments with these parameters:

#### Input Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `skipDeploy` | choice | `false` | Run tests only without deploying infrastructure |
| `loadTestDuration` | string | `30s` | Duration for load testing (e.g., 30s, 10m, 1h) |
| `deploymentName` | string | `''` | Custom deployment name (use `ci` for shared CI environment) |

#### Examples

**Test-only run:**
- `skipDeploy`: `true`
- Result: Runs all tests without deploying to AWS

**Custom deployment:**
- `deploymentName`: `feature-auth-v2`
- Result: Deploys to `AppStack-feature-auth-v2` with CI domain

**Shared CI deployment:**
- `deploymentName`: `ci`
- Result: Deploys to `AppStack-ci` (shared CI environment)

## Deployment Naming Convention

The workflow uses a sophisticated naming strategy to support multiple concurrent deployments:

### Environment Names (ENV_NAME)
- `prod`: main branch deployments
- `ci`: all other deployments

### Deployment Names (DEPLOYMENT_NAME)
- `prod`: main branch → `AppStack-prod`
- `ci`: manual dispatch with `deploymentName: ci` → `AppStack-ci`
- `ci-<branch>`: feature branches → `AppStack-ci-feature-nam` (truncated to 16 chars)

### Stack Naming Examples

| Trigger | ENV_NAME | DEPLOYMENT_NAME | Stacks Created |
|---------|----------|-----------------|----------------|
| Push to `main` | `prod` | `prod` | `ObservabilityStack-prod`, `DevStack-prod`, `AppStack-prod` |
| Push to `feature/new-auth` | `ci` | `ci-feature-new-au` | Uses existing `ObservabilityStack-ci`, `DevStack-ci`; creates `AppStack-ci-feature-new-au` |
| Manual dispatch `deploymentName: ci` | `ci` | `ci` | Uses existing observability/dev stacks; creates `AppStack-ci` |

## Job Pipeline

### 1. `names` Job
**Purpose:** Compute deployment configuration
**Outputs:**
- `environment-name`: Environment for secrets/variables
- `deployment-name`: Stack suffix for CDK deployment

### 2. `npm-test` Job
**Purpose:** Run unit tests and linting
**Dependencies:** None (runs in parallel)
**Steps:**
- Node.js 22 setup
- Dependency installation (`npm ci`)
- Unit test execution (`npm test`)
- Formatting validation (`npm run formatting`)

### 3. `maven-test` Job
**Purpose:** Test CDK infrastructure code
**Dependencies:** None (runs in parallel)
**Steps:**
- Java 21 setup
- Maven dependency resolution
- CDK synthesis validation
- Java unit test execution

### 4. `build-and-deploy` Job
**Purpose:** Deploy infrastructure and application
**Dependencies:** `names`, `npm-test`, `maven-test`
**Environment:** Uses computed environment name for AWS credentials
**Steps:**
- AWS authentication via OIDC
- CDK deployment (observability, dev, app stacks)
- User provisioning for testing
- Artifact uploads (deployment info)

### 5. `playwright-tests` Job
**Purpose:** End-to-end testing against deployed environment
**Dependencies:** `build-and-deploy`
**Artifacts Generated:**
- Screenshots: Visual proof of functionality
- Videos: Recording of test execution
- Traces: Detailed performance data
- Test reports: Detailed pass/fail information

### 6. `load-test` Job (Optional)
**Purpose:** Performance validation under load
**Dependencies:** `playwright-tests`
**Configuration:** Uses `loadTestDuration` parameter

### 7. `cleanup` Job
**Purpose:** Remove temporary deployments
**Dependencies:** All test jobs complete
**Behavior:**
- Always runs for branch deployments (`ci-*` pattern)
- Skipped for `prod` and `ci` deployments (persistent)

## Environment Variables and Secrets

### Repository Variables (Required)
- `DEPLOY_ROLE_ARN`: IAM role ARN for AWS authentication

### Environment-Specific Variables
Set in repository environments (`prod`, `ci`):
- `AWS_CERTIFICATE_ARN`: ACM certificate for HTTPS
- `AWS_HOSTED_ZONE_ID`: Route53 hosted zone
- `AWS_HOSTED_ZONE_NAME`: Domain name

### Runtime Environment Variables
- `JAVA_VERSION`: `21`
- `NODE_VERSION`: `22`
- `AWS_REGION`: `us-east-1`

## Workflow Outputs and Artifacts

### Job Outputs
```yaml
# From names job
environment-name: "ci" | "prod"
deployment-name: "prod" | "ci" | "ci-<branch-truncated>"

# From build-and-deploy job
base-url: "https://oidc-ci.antonycc.com" | "https://oidc.antonycc.com"
cognito-domain: "https://auth.oidc-ci.antonycc.com"
```

### Artifacts
- **deployment-info**: JSON with deployment URLs and configuration
- **playwright-report**: HTML test report with screenshots and videos
- **test-results**: Detailed test execution data

## Troubleshooting

### Common Failures

**Authentication Errors**
```
Error: Could not assume role with provided credentials
```
**Solution:** Verify `DEPLOY_ROLE_ARN` variable and OIDC provider configuration

**CDK Deployment Failures**
```
Error: Certificate not found or hosted zone invalid
```
**Solution:** Ensure certificate is in `us-east-1` and environment variables are correct

**Test Timeouts**
```
Error: Playwright test timed out after 90 seconds
```
**Solution:** Lambda cold starts can take 1-3 seconds; timeouts accommodate this

**Concurrent Deployment Conflicts**
```
Error: Another deployment is in progress
```
**Solution:** Workflow uses concurrency groups to prevent conflicts; wait for completion

### Debugging Steps

1. **Check Job Dependencies:**
   - Ensure all prerequisite jobs completed successfully
   - Review job dependency chain in workflow visualization

2. **Examine Environment Selection:**
   - Verify computed `ENV_NAME` and `DEPLOYMENT_NAME` in `names` job output
   - Confirm environment variables are set for the target environment

3. **Review CDK Outputs:**
   - Check CloudFormation stack events in AWS Console
   - Examine CDK synthesis logs for configuration issues

4. **Analyze Test Failures:**
   - Download Playwright artifacts for visual debugging
   - Review test traces for performance bottlenecks
   - Check application logs in CloudWatch

### Manual Intervention

**Force Cleanup:**
```bash
# Manually destroy a stuck deployment
npx dotenv -e .env.ci -- DEPLOYMENT_NAME=ci-stuck-branch npx cdk destroy AppStack-ci-stuck-branch --force
```

**Emergency Stack Recovery:**
```bash
# Import existing resources if state is corrupted
npx cdk import AppStack-prod
```

## Monitoring and Observability

### CloudWatch Integration
The workflow automatically sets up:
- Application logs: `/aws/lambda/AppStack-{deployment}-*`
- Infrastructure metrics: Standard CloudWatch metrics
- Custom metrics: Authentication success/failure rates

### Performance Metrics
- **Cold Start Latency**: Lambda initialization time
- **Authentication Flow Duration**: End-to-end login timing
- **Token Validation Performance**: JWKS cache efficiency

### Alerting
Configure CloudWatch alarms for:
- Error rates above threshold
- Unusual authentication patterns
- Performance degradation

## Security Considerations

### OIDC Authentication
- Uses GitHub OIDC provider for secure, credential-less authentication
- Role assumption limited to specific repository and branch patterns
- No long-lived credentials stored in repository

### Deployment Isolation
- Branch deployments use isolated stacks
- Shared observability infrastructure for cost efficiency
- Production environment completely separated

### Secrets Management
- Environment-specific secrets in GitHub environments
- AWS credentials never logged or exposed
- Automatic cleanup of temporary deployments

## Best Practices

### Branch Strategy
- Use descriptive branch names (max 16 chars for deployment names)
- Prefix feature branches consistently (`feature/`, `fix/`)
- Delete branches after merge to trigger automatic cleanup

### Testing Strategy
- Run local tests before pushing (`npm test`)
- Use manual dispatch for testing deployment configuration
- Verify Playwright artifacts for UI changes

### Deployment Strategy
- Use `skipDeploy: true` for testing code changes without infrastructure updates
- Deploy to shared CI environment for integration testing
- Reserve production deployments for main branch only

### Monitoring Strategy
- Review deployment artifacts regularly
- Monitor CloudWatch dashboards for performance trends
- Set up alerts for critical authentication failures

## Migration and Maintenance

### Updating Dependencies
- Node.js version changes require workflow and CDK updates
- Java version changes affect Maven and CDK synthesis
- Test framework updates may require artifact configuration changes

### Scaling Considerations
- Concurrent branch limits (AWS CloudFormation stack limits)
- DynamoDB capacity planning for load tests
- Lambda concurrency limits for high-traffic scenarios

### Backup and Recovery
- Infrastructure as code ensures reproducible deployments
- Database tables configured with point-in-time recovery
- Static assets stored in S3 with versioning enabled