import { analyzeFile } from "../analyzer";
import { aggregateReview } from "./aggregator";
import type { ReviewResult } from "./types";
import type { ReviewFinding } from "./types";
import type { AIProvider, AIReviewResult } from "../ai/types";

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
export interface ReviewFile {
  path: string;
  content: string;
}

export function reviewFiles(files: ReviewFile[]): ReviewResult {
  const startedAt = performance.now();

  const findings = files.flatMap(({ path, content }) =>
    analyzeFile(path, content),
  );

  return aggregateReview(findings, performance.now() - startedAt);
}
export interface PRReviewInput {
  title: string;
  description?: string;
  files: ReviewFile[];
}

export async function reviewPullRequest(
  input: PRReviewInput,
  aiProvider?: AIProvider,
): Promise<ReviewResult> {
  const startedAt = performance.now();

  const deterministicFindings = input.files.flatMap(({ path, content }) =>
    analyzeFile(path, content),
  );

  let findings = deterministicFindings;

  if (aiProvider) {
    const diff = input.files
      .map((file) => `FILE: ${file.path}\n${file.content}`)
      .join("\n\n");

    const aiResult = await aiProvider.review({
      pullRequestTitle: input.title,

      pullRequestDescription: input.description,

      diff,

      deterministicFindings: JSON.stringify(deterministicFindings),
    });

    findings = [...findings, ...convertAIFindings(aiResult)];
  }

  return aggregateReview(findings, performance.now() - startedAt);
}
