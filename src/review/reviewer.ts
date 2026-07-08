import { analyzeFiles } from "../analyzer";
import { aggregateReview } from "./aggregator";
import type { ReviewResult } from "./types";
import type { ReviewFinding } from "./types";
import type { AIProvider, AIReviewResult } from "../ai/types";
import { ReviewEngine } from "../engine/review-engine";
import { ReactEngine } from "../react/engine";
import { reactPlugin } from "../react";

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

  const findings = analyzeFiles(files);

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
  const deterministicFindings = [
    ...analyzeFiles(input.files),
    ...input.files.flatMap(({ path, content }) =>
      analyzeReactFile(path, content),
    ),
  ];
  const diff = input.files
    .map((file) => `FILE: ${file.path}\n${file.content}`)
    .join("\n\n");

  return new ReviewEngine().execute({
    deterministicFindings,
    aiProvider,
    aiInput: aiProvider
      ? {
          pullRequestTitle: input.title,
          pullRequestDescription: input.description,
          diff,
          deterministicFindings: JSON.stringify(deterministicFindings),
        }
      : undefined,
  });
}

function analyzeReactFile(path: string, content: string): ReviewFinding[] {
  if (!/\.(tsx|jsx)$/.test(path)) {
    return [];
  }

  return new ReactEngine().analyze({
    source: content,
    file: path,
    plugins: [reactPlugin],
  });
}
