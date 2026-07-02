import type {
  AIReviewInput,
} from "./types";

export function buildReviewPrompt(
  input: AIReviewInput,
): string {
  return `
You are a Staff Frontend Engineer,
Software Architect and Security Engineer.

Review this GitHub Pull Request.

Your goal is to identify REAL engineering problems.

Do NOT report:

- formatting preferences
- naming preferences
- subjective style choices
- issues already clearly detected by deterministic rules

Focus on:

1. Correctness
2. React behavior
3. TypeScript correctness
4. Security
5. Performance
6. State management
7. API contracts
8. Testing
9. Accessibility
10. Micro-Frontend architecture
11. Maintainability

Severity:

critical:
Immediate security, data loss or production-breaking issue.

high:
Major correctness, security or architecture problem.

medium:
Meaningful engineering problem.

low:
Minor issue worth addressing.

info:
Observation or improvement.

Confidence:

0.0 - 1.0

Only report findings when confidence >= 0.65.

Return JSON only.

Schema:

{
  "findings": [
    {
      "title": "string",
      "message": "string",
      "severity": "critical|high|medium|low|info",
      "suggestion": "string",
      "confidence": 0.0,
      "file": "string",
      "line": 1
    }
  ]
}

PR TITLE:

${input.pullRequestTitle}

PR DESCRIPTION:

${input.pullRequestDescription ?? "N/A"}

DETERMINISTIC FINDINGS:

${input.deterministicFindings}

DIFF:

${input.diff}
`;
}