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