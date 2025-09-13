# Auto-Select Best Opportunity Prompt

Analyze the current repository and all available prompts in the `./prompts` directory to automatically select the prompt type where there is the greatest opportunity to add value.

## Selection Process

1. **Review All Available Prompts**: Examine each prompt file in the `./prompts` directory to understand their focus areas:
   - `expand-capabilities.md` - Adding new features and integrations
   - `prune-focus.md` - Removing unused code and simplifying complexity
   - `abstract-libraries.md` - Replacing custom code with proven libraries
   - `increase-consistency.md` - Standardizing patterns and conventions
   - `refresh-documentation.md` - Updating and improving documentation

2. **Repository Analysis**: Evaluate the current state of the repository across all areas:
   - Code quality and consistency patterns
   - Documentation completeness and accuracy
   - Library usage and custom implementations
   - Feature completeness and expansion opportunities
   - Code complexity and maintainability issues

3. **Opportunity Assessment**: For each prompt area, assess:
   - **Impact Potential**: How much improvement can be achieved
   - **Implementation Feasibility**: How achievable the changes are
   - **Current Gap Size**: How far the repository is from best practices in this area
   - **Value-to-Effort Ratio**: Which area provides maximum benefit for development time
   - **Strategic Alignment**: Which improvements best support the project's goals

## Selection Criteria

Prioritize the prompt area with the highest combined score based on:

### High Priority Indicators
- **Critical gaps** in current implementation that affect functionality or reliability
- **High-impact improvements** that significantly enhance developer productivity
- **Low-hanging fruit** with substantial benefits and minimal implementation risk
- **Foundational issues** that block or impede other improvements

### Evaluation Areas
- **Code Quality**: Inconsistencies, code smells, technical debt
- **Documentation**: Missing, outdated, or inadequate documentation
- **Architecture**: Over-engineered solutions, library opportunities
- **Features**: Missing capabilities that provide clear user value
- **Maintainability**: Complex, hard-to-understand, or redundant code

## Implementation Instructions

Once you've selected the prompt with the greatest opportunity:

1. **Justify Your Selection**: Provide clear reasoning for why this prompt area offers the greatest value-add opportunity
2. **Apply the Selected Prompt**: Execute the full scope of the selected prompt's instructions
3. **Focus on High-Impact Changes**: Prioritize improvements that provide the most significant benefits
4. **Maintain Project Standards**: Ensure all changes align with existing architecture and patterns

## Output Format

Begin your response with:

```
## Auto-Selection Analysis

**Selected Prompt**: [prompt-name]
**Selection Rationale**: [2-3 sentence explanation of why this area has the greatest opportunity]

### Current State Assessment
- [Key findings about current state in selected area]

### Opportunity Impact
- [Expected benefits and improvements]

---

## [Selected Prompt Title]
[Continue with full execution of the selected prompt]
```

## Constraints

- Select only ONE prompt to execute
- Provide concrete, actionable recommendations
- Focus on changes that can be implemented incrementally
- Maintain compatibility with existing functionality
- Consider the project's serverless OIDC provider context and AWS architecture

> Formatting and style: Use the repository’s tooling — ESLint (flat config) + Prettier for JS (ESM) and Spotless (Palantir Java Format) for Java. Run npm run formatting / npm run formatting-fix. See README → Code style, formatting, and IDE setup.
> Do not apply styles changes to code that you are not otherwise changes and prefer to match the existing local style when applying the style guides would be jarring.
