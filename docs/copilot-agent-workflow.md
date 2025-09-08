# GitHub Copilot Agent Workflow

## Overview

The `copilot-agent.yml` workflow has been updated to use the new GitHub Copilot coding agent approach instead of the deprecated `gh copilot suggest` command.

## How It Works

### Old Approach (Deprecated)
- Used `gh copilot suggest` command
- Required GitHub CLI Copilot extension
- Generated text responses as artifacts
- Manual interpretation of suggestions required

### New Approach (Current)
- Creates GitHub issues assigned to `@copilot`
- Uses standard GitHub CLI without extensions
- Copilot agent automatically creates pull requests
- Direct integration with GitHub's issue/PR workflow

## Workflow Steps

1. **Issue Check**: Checks for existing open issues and determines whether to create a new one
2. **Repository Analysis**: Analyzes repository state to select appropriate prompt
3. **GitHub CLI Setup**: Authenticates with GitHub CLI (no extensions needed)
4. **Issue Creation**: Creates detailed GitHub issue assigned to `@copilot` (if allowed)
5. **Automatic Processing**: Copilot agent processes issue and creates PR
6. **Summary Generation**: Reports workflow results and next steps

## Usage

### Manual Trigger
```bash
gh workflow run copilot-agent.yml
```

### With Specific Prompt
```bash
gh workflow run copilot-agent.yml \
  -f prompt_selection=refresh-documentation \
  -f target_branch=main
```

### Override Skip Behavior
```bash
gh workflow run copilot-agent.yml \
  -f prompt_selection=auto-select \
  -f skip_if_open_issues=false
```

### Create New Prompt Example
```bash
gh workflow run copilot-agent.yml \
  -f prompt_selection=create-new-prompt \
  -f target_branch=main
```

### Security & Compliance Hardening Example
```bash
gh workflow run copilot-agent.yml \
  -f prompt_selection=security-compliance-hardening \
  -f target_branch=main
```

### Available Prompts
- `auto-select`: Automatically choose based on repository analysis
- `expand-capabilities`: Suggest ways to expand repository capabilities
- `prune-focus`: Identify areas to prune for improved focus
- `abstract-libraries`: Find opportunities to abstract to libraries
- `increase-consistency`: Improve consistency across the codebase
- `refresh-documentation`: Update and improve documentation
- `security-compliance-hardening`: Enhance security posture and compliance readiness
- `create-new-prompt`: Analyze repository gaps and create a new strategic prompt

## Issue Management

### Default Behavior
By default, the workflow will **skip creating new issues** if there are already open issues in the repository. This prevents issue spam and allows focus on addressing existing items.

### Overriding the Default
To force issue creation even when open issues exist, set the `skip_if_open_issues` parameter to `false`:

```bash
gh workflow run copilot-agent.yml \
  -f skip_if_open_issues=false \
  -f prompt_selection=auto-select
```

### Issue Titles
Issue titles now use a clean format: `Repository Enhancement: [prompt-type]`

Previous format (deprecated): `Repository Enhancement: [prompt-type] - Manual Trigger (YYYY-MM-DD)`

## Iteration

After the agent creates a PR, you can iterate by commenting on the PR:

```bash
gh pr comment <PR_NUMBER> -b "Please add tests for edge cases @copilot"
```

The `@copilot` mention will trigger a new agent run to address the feedback.

## Prompt Details

### Security & Compliance Hardening

The `security-compliance-hardening` prompt focuses on enhancing the security posture and compliance readiness of the OIDC provider for production deployment. This is particularly critical for authentication services that handle sensitive identity data.

**Key Focus Areas:**
- **OIDC-Specific Security**: Token security, OAuth 2.0 flow protection, federation security
- **Compliance Frameworks**: SOC2, GDPR, PCI DSS, HIPAA readiness
- **Infrastructure Hardening**: AWS serverless security, Lambda, DynamoDB, CloudFront
- **Threat Protection**: Advanced monitoring, incident response, vulnerability management

**When to Use:**
- Preparing for production deployment of the OIDC provider
- Implementing enterprise security requirements
- Addressing compliance and regulatory needs
- Enhancing security monitoring and incident response
- Following security audit recommendations

**Expected Outcomes:**
- Enhanced security controls and documentation
- Compliance framework implementation guidance
- Advanced threat detection and monitoring setup
- Security incident response procedures
- Penetration testing and vulnerability management processes

## Benefits

- **Modern Approach**: Uses current GitHub Copilot coding agent
- **Automated PRs**: Agent creates pull requests automatically  
- **Better Integration**: Native GitHub issue/PR workflow
- **Iterative**: Easy to provide feedback and iterate
- **No Extensions**: Uses standard GitHub CLI without additional setup

## Requirements

- GitHub Pro, Pro+, Business, or Enterprise plan
- Repository with Copilot coding agent enabled
- Standard GitHub CLI access

## Troubleshooting

### Common Issues

**Issue Creation Fails**
- **Problem**: "Copilot agent not available" or permission denied
- **Solution**: Verify repository has GitHub Copilot enabled and user has appropriate plan
- **Check**: Repository settings → Features → GitHub Copilot

**No Pull Request Created**  
- **Problem**: Issue created but no automatic PR follows
- **Solution**: Check if there are existing open issues blocking new work
- **Workaround**: Use `skip_if_open_issues=false` parameter or close existing issues

**Workflow Fails with CLI Errors**
- **Problem**: GitHub CLI authentication or permission issues
- **Solution**: Verify GITHUB_TOKEN has appropriate permissions (issues: write, contents: write, pull-requests: write)
- **Debug**: Check workflow logs for specific permission error details

**Agent Creates Minimal Changes**
- **Problem**: Copilot agent makes very small or no changes
- **Solution**: Issue description may be too narrow - provide more specific requirements
- **Enhancement**: Use more detailed prompts with specific examples

### Debugging Steps

**1. Verify Repository Configuration**
```bash
# Check if Copilot is enabled for repository
gh api repos/:owner/:repo/copilot-information

# Verify user permissions
gh api user
```

**2. Manual Issue Creation Test**
```bash
# Test issue creation manually
gh issue create \
  --title "Test Issue for Copilot" \
  --body "Test description" \
  --assignee @copilot
```

**3. Check Workflow Logs**
- Navigate to Actions tab in repository
- Click on failed workflow run
- Examine step-by-step logs for error details
- Check for authentication, permission, or API rate limit issues

**4. Validate Environment Variables**
```bash
# Check if required secrets/variables are set
gh variable list
gh secret list
```

### Performance Optimization

**Reduce Workflow Runtime**
- Use specific prompt selection instead of auto-select
- Skip issue checks when not needed with `skip_if_open_issues=false`
- Use targeted branch names for focused work

**Improve Agent Response Quality**
- Provide detailed, specific requirements in issue descriptions
- Include examples and expected outcomes
- Reference specific files or components when relevant

**Monitor Resource Usage**
- Check workflow billing usage if on paid plans
- Monitor API rate limits for high-frequency usage
- Consider batching multiple related requests

### Best Practices

**Issue Management**
- Close completed issues promptly to avoid workflow skipping
- Use descriptive issue titles that clearly state the objective
- Tag issues appropriately for better organization

**Prompt Engineering**
- Be specific about desired outcomes
- Include technical constraints and requirements
- Provide examples of expected changes when possible

**Review Process**
- Review generated PRs carefully before merging
- Test changes in appropriate environments
- Validate that changes meet original requirements

### Advanced Configuration

**Custom Prompt Development**
```bash
# Create new prompt file
echo "# Custom Prompt" > prompts/custom-prompt.md
echo "Custom instructions here..." >> prompts/custom-prompt.md

# Use in workflow
gh workflow run copilot-agent.yml \
  -f prompt_selection=custom-prompt \
  -f target_branch=main
```

**Environment-Specific Deployments**
```bash
# Target specific deployment environments
gh workflow run copilot-agent.yml \
  -f prompt_selection=deployment-optimization \
  -f target_branch=staging
```

**Bulk Operations**
```bash
# Process multiple prompts in sequence
for prompt in refresh-documentation security-hardening performance-optimization; do
  gh workflow run copilot-agent.yml \
    -f prompt_selection=$prompt \
    -f target_branch=main
  sleep 300  # Wait 5 minutes between requests
done
```