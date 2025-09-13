# Refresh Documentation Prompt

Analyze the current repository and identify opportunities to refresh, improve, and standardize documentation across all levels.

Focus on:
- Updating outdated documentation and README files.
- Adding orm update missing API documentation in an OpenAI spec in the project root.
- Improving developer setup and onboarding guides in the README.
- Enhancing deployment and operational documentation in the README.
- Standardizing inline code documentation.
- Improving error messages in the code and error documentation in the README.

Areas requiring documentation refresh existing files with:
- README.md files at project and module levels.
- Inline code comments and JSDoc annotations.
- API endpoint documentation and examples.
- Environment setup and configuration guides.
- Deployment procedures and troubleshooting.
- Update workflow documentation for GitHub Actions.

Provide recommendations that:
- Improve developer productivity and onboarding.
- Reduce support burden through clear guides.
- Enhance code maintainability with better comments.
- Keep documentation synchronized with code changes.
- Maintain stability by giving the automated tools documents consistent with code.

> Formatting and style: Keep prose brief and defer to the repo’s formatting configs — ESLint (flat) + Prettier for JS (ESM) and Spotless (Palantir Java Format) for Java. Use npm run formatting / npm run formatting-fix. See README for IDE setup.
> Do not apply styles changes to code that you are not otherwise changes and prefer to match the existing local style when applying the style guides would be jarring.
