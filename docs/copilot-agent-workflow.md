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

1. **Repository Analysis**: Analyzes repository state to select appropriate prompt
2. **GitHub CLI Setup**: Authenticates with GitHub CLI (no extensions needed)
3. **Issue Creation**: Creates detailed GitHub issue assigned to `@copilot`
4. **Automatic Processing**: Copilot agent processes issue and creates PR
5. **Summary Generation**: Reports workflow results and next steps

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

### Create New Prompt Example
```bash
gh workflow run copilot-agent.yml \
  -f prompt_selection=create-new-prompt \
  -f target_branch=main
```

### Available Prompts
- `auto-select`: Automatically choose based on repository analysis
- `expand-capabilities`: Suggest ways to expand repository capabilities
- `prune-focus`: Identify areas to prune for improved focus
- `abstract-libraries`: Find opportunities to abstract to libraries
- `increase-consistency`: Improve consistency across the codebase
- `refresh-documentation`: Update and improve documentation
- `create-new-prompt`: Analyze repository gaps and create a new strategic prompt

## Iteration

After the agent creates a PR, you can iterate by commenting on the PR:

```bash
gh pr comment <PR_NUMBER> -b "Please add tests for edge cases @copilot"
```

The `@copilot` mention will trigger a new agent run to address the feedback.

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