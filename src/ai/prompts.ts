import type { AIReviewInput } from "./types";

export function buildReviewPrompt(input: AIReviewInput): string {
  return `
You are a Staff Frontend Engineer and Software Architect.

Review the following pull request.

Focus on:

1. Correctness
2. React architecture
3. TypeScript design
4. Security
5. Performance
6. Testing
7. API contracts
8. Micro-Frontend boundaries
9. Maintainability
10. Developer experience

Do not report stylistic preferences as defects.

Prioritize actionable findings.

Return JSON only:

{
  "findings": [
    {
      "title": "...",
      "message": "...",
      "severity": "critical|high|medium|low|info",
      "suggestion": "...",
      "confidence": 0.0
    }
  ]
}

PR TITLE:

${input.pullRequestTitle}

PR DESCRIPTION:

${input.pullRequestDescription ?? ""}

DETERMINISTIC FINDINGS:

${input.deterministicFindings}

DIFF:

${input.diff}
`;
}
