# Create New Prompt

> Formatting and style: Follow the repo’s formatters — ESLint (flat) + Prettier for JS (ESM) and Spotless (Palantir Java Format) for Java. Use npm run formatting / npm run formatting-fix. See README for IDE setup and links.

Analyze the current repository and the existing prompts in the `prompts/` directory to identify gaps or opportunities that are not currently covered by the existing prompt types.

## Current Prompts Analysis

Review the existing prompts and their focus areas:
- `expand-capabilities.md` - New features and integrations
- `prune-focus.md` - Code cleanup and simplification
- `abstract-libraries.md` - Library adoption and abstraction
- `increase-consistency.md` - Standardization across codebase
- `refresh-documentation.md` - Documentation improvements

## Task: Create a New Strategic Prompt

Based on your analysis of the repository structure, codebase, architecture, and existing prompts, create a new prompt that addresses an important gap or opportunity that would provide significant value.

**CRITICAL**: Before creating any new prompt, you must conduct rigorous multi-perspective analysis following these coding guidelines:
- Adhere to AWS Well-Architected principles
- Apply security best practices (IAM least privilege, encryption, logging)
- Use infrastructure-as-code best practices for CDK code
- Follow modern ES2022+ patterns for Node.js code
- Ensure comprehensive error handling and logging

### Required Multi-Scenario Evaluation
Evaluate AT LEAST 3 different approaches for the new prompt:
- **Scenario A**: Conservative/minimal change approach
- **Scenario B**: Optimized/refactored approach
- **Scenario C**: Alternative architectural approach

For each scenario, analyze:
- Implementation complexity
- Performance implications
- Security considerations (IAM least privilege, encryption, logging)
- Maintainability impact
- Deployment requirements
- Testing strategy

### Mandatory Internal Review Process
Before executing the prompt creation, conduct this internal review:

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

Your new prompt should:

### 1. Identify the Gap
- Analyze what aspects of repository improvement are not covered by existing prompts
- Consider the repository's specific domain (OIDC provider, serverless architecture, AWS CDK)
- Look for opportunities in OIDC-specific areas like:
  - Token validation and JWT security patterns
  - OAuth 2.0 and OpenID Connect flow implementations
  - Identity federation and provider integration
  - JWKS (JSON Web Key Set) management and rotation
  - Authorization code and refresh token lifecycle
  - OIDC discovery endpoint optimization
  - Provider-specific security patterns and compliance
  - Serverless authentication architecture patterns

### 2. Create the Prompt File
- Create a new markdown file in the `prompts/` directory with a descriptive filename
- Follow the established format and style of existing prompts
- Include clear focus areas and specific actionable guidance
- Make it comprehensive but focused on a coherent theme

### 3. Update the Workflow Configuration
- Add the new prompt to the workflow choices in `.github/workflows/copilot-agent.yml`
- Ensure it integrates properly with the existing prompt selection system
- Place it in an appropriate position within the options list

### 4. Update Documentation
- Add documentation for the new prompt in `docs/copilot-agent-workflow.md`
- Explain what the new prompt does and when to use it
- Maintain consistency with existing documentation patterns

## Deliverables

1. **New prompt markdown file** - A well-crafted prompt targeting an identified gap
2. **Updated workflow file** - Modified `.github/workflows/copilot-agent.yml` with the new option
3. **Updated documentation** - Enhanced `docs/copilot-agent-workflow.md` with details about the new prompt
4. **Justification** - Clear explanation of why this particular prompt addresses an important need

## Success Criteria

The new prompt must meet these mandatory requirements:
- Address a genuine gap not covered by existing prompts
- Be strategically valuable for the repository's OIDC provider goals
- Follow AWS Well-Architected principles (security, reliability, performance, cost optimization, operational excellence)
- Include security best practices assessment (IAM least privilege, encryption, logging)
- Complete the internal review process as described in the "Mandatory Internal Review Process" section above.
- Integrate seamlessly with the existing prompt system
- Provide clear, actionable guidance specific to OIDC provider development
- Include rollback and deployment risk assessment

Focus on creating something that would be genuinely useful and that represents the most impactful improvement opportunity currently missing from the prompt collection.
