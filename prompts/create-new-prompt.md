# Create New Prompt

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

Your new prompt should:

### 1. Identify the Gap
- Analyze what aspects of repository improvement are not covered by existing prompts
- Consider the repository's specific domain (OIDC provider, serverless architecture, AWS CDK)
- Look for opportunities in areas like:
  - Security and compliance
  - Performance and scalability  
  - Developer experience and tooling
  - Operational excellence and monitoring
  - Cost optimization
  - Integration patterns
  - Testing strategies
  - CI/CD improvements

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

The new prompt should:
- Address a genuine gap not covered by existing prompts  
- Be strategically valuable for the repository's goals
- Follow established patterns and quality standards
- Integrate seamlessly with the existing prompt system
- Provide clear, actionable guidance for the GitHub Copilot agent

Focus on creating something that would be genuinely useful and that represents the most impactful improvement opportunity currently missing from the prompt collection.