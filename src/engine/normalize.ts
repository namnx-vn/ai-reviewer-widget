import type {
  AIReviewResult,
} from "../ai/types";

import type {
  ReviewFinding,
} from "../review/types";

export function normalizeAIFindings(
  result: AIReviewResult,
): ReviewFinding[] {
  return result.findings.map(
    (finding, index) => ({
      id: `ai-${index + 1}`,

      ruleId:
        finding.agent === undefined
          ? "ai.semantic-review"
          : `ai.${finding.agent}-review`,

      title:
        finding.title,

      message:
        finding.message,

      severity:
        finding.severity,

      source: "ai",

      confidence:
        finding.confidence,

      suggestion:
        finding.suggestion,

      location:
        finding.file
          ? {
              file:
                finding.file,

              line:
                finding.line,
            }
          : undefined,
    }),
  );
}
