import type { AIProvider, AIReviewResult } from "../ai/types";
import { createDefaultReviewUseCases } from "../application/review";
import type {
  PullRequestReviewInput,
  SecurityProfileId,
  SecurityQualityGateSuppression,
  SourceFile,
} from "../application/review";
import type { ReviewFinding, ReviewResult } from "../domain/review";

export type ReviewFile = SourceFile;

export interface PRReviewInput extends Omit<PullRequestReviewInput, "securityQualityGate"> {
  readonly securityQualityGate?: {
    readonly profile?: SecurityProfileId;
    readonly evaluatedAt: string;
    readonly baselineFindingIds?: readonly string[];
    readonly suppressions?: readonly SecurityQualityGateSuppression[];
  };
}

export function convertAIFindings(result: AIReviewResult): ReviewFinding[] {
  return result.findings.map((finding, index) => ({
    id: `ai-${index + 1}`,
    ruleId: "ai.semantic-review",
    title: finding.title,
    message: finding.message,
    severity: finding.severity,
    source: "ai",
    suggestion: finding.suggestion,
    confidence: finding.confidence,
  }));
}

export function reviewFiles(files: ReviewFile[]): ReviewResult {
  return createDefaultReviewUseCases().reviewFiles(files);
}

export function reviewPullRequest(
  input: PRReviewInput,
  aiProvider?: AIProvider,
): Promise<ReviewResult> {
  return createDefaultReviewUseCases().reviewPullRequest(input, aiProvider);
}
