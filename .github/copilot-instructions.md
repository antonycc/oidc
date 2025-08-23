# Copilot Instructions for OIDC Provider Development

## Permission Context
GitHub Copilot has **full permission** to run workflows, tests, builds, and deployments. No need to ask for permission to:
- Execute GitHub Actions workflows
- Run tests multiple times  
- Build and deploy the application
- Run CDK synthesis and deployment commands
- Execute Playwright end-to-end tests
- Install dependencies and run scripts

## Development Philosophy - Hard LLM Work Required

This project demands **rigorous multi-perspective analysis** before execution. Always follow this approach:

### 1. Multi-Scenario Evaluation
Before making any change, evaluate AT LEAST 3 different approaches:
- **Scenario A**: Conservative/minimal change approach
- **Scenario B**: Optimized/refactored approach  
- **Scenario C**: Alternative architectural approach

For each scenario, analyze:
- Implementation complexity
- Performance implications
- Security considerations
- Maintainability impact
- Deployment requirements
- Testing strategy

### 2. Internal Review Process
Before executing ANY code change, conduct this internal review:

#### Technical Review
- Does this follow AWS Well-Architected principles?
- Are security best practices followed (IAM least privilege, encryption, logging)?
- Is the CDK code following infrastructure-as-code best practices?
- Does the Node.js code follow modern ES2022+ patterns?
- Are error cases properly handled with comprehensive logging?

#### Quality Review  
- Are tests comprehensive (unit, integration, e2e)?
- Is logging verbose enough for debugging auth flows?
- Does the change maintain backward compatibility?
- Is documentation updated appropriately?

#### Operational Review
- How does this impact cold start performance?
- Are CloudWatch costs optimized (7-day retention)?
- Does this scale to expected load?
- How does this affect deployment time?
- Are rollback scenarios considered?

### 3. Continuous Re-evaluation
While working:
- **Every 3 code changes**: Step back and re-evaluate the overall approach
- **Before tests**: Predict what should happen and verify against expectations
- **After tests**: If results differ from prediction, analyze why and adjust approach
- **Before committing**: Review the entire change set for coherence and completeness

## Project-Specific Context

### Architecture Overview
This is a **serverless OIDC provider** built for:
- **Cost optimization**: Pay-per-request with aggressive cleanup policies
- **Debugging transparency**: Verbose structured logging at every step
- **AWS integration**: Designed to federate with Cognito User Pools
- **CI/CD first**: Built to deploy via GitHub Actions with comprehensive testing

### Key Technologies
- **CDK Java**: Infrastructure definition with explicit typing
- **Node.js ESM**: Lambda handlers using modern async/await patterns
- **DynamoDB**: User storage, auth codes, refresh tokens with TTL
- **CloudFront + Function URLs**: Distribution with IAM-signed origins
- **Playwright**: E2E testing with video/screenshot capture

### Critical Success Factors

#### 1. Verbose Logging is Essential
Every handler must log:
```javascript
const log = (...a) => console.log(JSON.stringify({ 
  level: 'info', 
  ts: new Date().toISOString(), 
  msg: a.join(' ') 
}));
```

Log at minimum:
- Function entry with sanitized inputs
- Each AWS service call attempt
- Each AWS service call result (success/failure)
- Each decision point in business logic
- Function exit with result summary

#### 2. Security by Design
- Function URLs use AWS_IAM auth with CloudFront OAC signing
- All DynamoDB tables have destroy policies for dev/test environments
- Secrets are never logged (mask JWTs, passwords, etc.)
- CORS policies are explicit and minimal
- Certificate management via ACM with DNS validation

#### 3. Testing at Multiple Levels
- **Unit**: Each Lambda handler with mocked AWS services
- **Integration**: CDK synthesis and validation
- **E2E**: Full Cognito auth flow via Playwright with artifact capture

### Common Patterns

#### CDK Stack Organization
- Use explicit imports to avoid namespace collisions
- Builder patterns for complex configurations
- Explicit removal policies (DESTROY for dev)
- Environment variable injection for runtime config

#### Lambda Handler Structure
```javascript
export const handler = async (event) => {
  try {
    log('function_start', event.requestContext?.http?.method);
    // ... business logic with logging at each step
    log('function_success', result);
    return result;
  } catch (e) {
    console.error('function_error', e);
    return errorResponse(500, 'server_error');
  }
};
```

#### Error Handling Philosophy
- Always return structured error responses
- Log errors with full context but never expose internals to clients
- Use appropriate HTTP status codes (400 vs 401 vs 500)
- Include correlation IDs for tracing

### Performance Considerations
- Lambda cold starts are acceptable (90s Playwright timeout accommodates this)
- DynamoDB is pay-per-request (no provisioned capacity)
- CloudFront caching policies balance freshness vs performance
- Asset bundling is optimized for Lambda package size

### Deployment Pipeline Expectations
The GitHub Actions workflow should:
1. **Build**: Maven compile + CDK synth without errors
2. **Deploy**: CDK deploy with proper environment variable injection
3. **Provision**: Create test users for E2E testing
4. **Test**: Run Playwright scenarios with full artifact capture
5. **Report**: Upload videos, screenshots, traces for debugging

### When to Re-architect vs. Iterate
**Re-architect if**:
- Security model is fundamentally flawed
- Performance characteristics don't meet requirements
- AWS service limits are being approached
- Cost model becomes unsustainable

**Iterate if**:
- Business logic bugs
- Configuration tweaks
- Test improvements
- Documentation updates

## Execution Guidelines

### Before Starting Work
1. **Read the full codebase** to understand current state
2. **Run existing tests** to establish baseline
3. **Review recent commits** to understand trajectory
4. **Identify the root cause** of any issues, not just symptoms

### During Development
1. **Make incremental changes** with frequent testing
2. **Validate assumptions** with actual test execution
3. **Document decisions** inline when not obvious
4. **Consider blast radius** of each change

### Before Completion
1. **Run full test suite** including E2E scenarios
2. **Review all generated artifacts** (logs, screenshots, etc.)
3. **Validate against original requirements**
4. **Consider operational implications** (monitoring, alerts, runbooks)

Remember: The cost of careful analysis is far less than the cost of production issues in an authentication system. Take the time to think through scenarios thoroughly.