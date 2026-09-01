import type { ReviewWarningCode } from "../../domain/review";
import type { OperationalDiagnosticCategory } from "./contracts";

export function categoryForReviewWarning(code: ReviewWarningCode): OperationalDiagnosticCategory {
  switch (code) {
    case "SOURCE_PARSE_FAILED":
      return "source";
    case "ANALYZER_CONTRIBUTION_FAILED":
    case "SECURITY_RULE_FAILED":
    case "REACT_RULE_FAILED":
      return "analyzer";
    case "AI_REVIEW_FAILED":
    case "AI_AGENT_FAILED":
    case "AI_INPUT_OMITTED":
    case "AI_INPUT_REDACTED":
    case "AI_INPUT_TRUNCATED":
      return "ai-provider";
  }
}

export function formatDeveloperDiagnostic(input: {
  readonly category: OperationalDiagnosticCategory;
  readonly code: string;
  readonly stage?: string;
}): string {
  return [input.category, input.stage, input.code].filter(Boolean).join(":");
}
