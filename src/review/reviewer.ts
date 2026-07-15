import { analyzeFiles } from "../analyzer";
import { aggregateReview } from "./aggregator";
import type { ReviewResult } from "./types";
import type { ReviewFinding, ReviewWarning } from "./types";
import type { AIProvider, AIReviewResult } from "../ai/types";
import { ReviewEngine } from "../engine/review-engine";
import { ReactEngine } from "../react/engine";
import { nextjsPlugin, reactPlugin } from "../react";
import type { ReactPlugin } from "../react/engine";
import { parseSource } from "../analyzer/ast/parser";

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

  const deterministicAnalysis = analyzeDeterministicFiles(files);

  return aggregateReview(
    deterministicAnalysis.findings,
    performance.now() - startedAt,
    deterministicAnalysis.warnings,
  );
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
  const deterministicAnalysis = analyzeDeterministicFiles(input.files);
  const diff = input.files
    .map((file) => `FILE: ${file.path}\n${file.content}`)
    .join("\n\n");

  return new ReviewEngine().execute({
    deterministicFindings: deterministicAnalysis.findings,
    warnings: deterministicAnalysis.warnings,
    aiProvider,
    aiInput: aiProvider
      ? {
          pullRequestTitle: input.title,
          pullRequestDescription: input.description,
          diff,
          deterministicFindings: JSON.stringify(deterministicAnalysis.findings),
        }
      : undefined,
  });
}

function analyzeDeterministicFiles(
  files: readonly ReviewFile[],
): DeterministicAnalysis {
  const { parseableFiles, warnings } = getParseableFiles(files);

  return {
    findings: [
      ...analyzeFiles(parseableFiles),
      ...parseableFiles.flatMap(({ path, content }) => analyzeReactFile(path, content)),
    ],
    warnings,
  };
}

interface DeterministicAnalysis {
  readonly findings: ReviewFinding[];
  readonly warnings: ReviewWarning[];
}

interface ParseableFilesResult {
  readonly parseableFiles: ReviewFile[];
  readonly warnings: ReviewWarning[];
}

function getParseableFiles(
  files: readonly ReviewFile[],
): ParseableFilesResult {
  const parseableFiles: ReviewFile[] = [];
  const warnings: ReviewWarning[] = [];

  for (const file of files) {
    if (!isSourceFile(file.path)) {
      continue;
    }

    try {
      parseSource(file.content);
      parseableFiles.push(file);
    } catch {
      warnings.push({
        code: "SOURCE_PARSE_FAILED",
        message: `Skipped deterministic analysis for ${file.path} because it could not be parsed.`,
      });
    }
  }

  return { parseableFiles, warnings };
}

function isSourceFile(path: string): boolean {
  return /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(path);
}

function analyzeReactFile(path: string, content: string): ReviewFinding[] {
  if (!/\.(tsx|jsx)$/.test(path)) {
    return [];
  }

  return new ReactEngine().analyze({
    source: content,
    file: path,
    plugins: getReactPlugins(path),
  });
}

function getReactPlugins(path: string): readonly ReactPlugin[] {
  return isAppRouterFile(path)
    ? [reactPlugin, nextjsPlugin]
    : [reactPlugin];
}

function isAppRouterFile(path: string): boolean {
  return /(^|\/)app(?:\/[^/]+)*\/(?:page|layout|template|loading|error|not-found|route)\.(?:tsx|jsx)$/.test(
    path.replace(/\\/g, "/"),
  );
}
