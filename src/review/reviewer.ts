import { analyzeFilesWithWarnings } from "../analyzer";
import { aggregateReview } from "./aggregator";
import type { ReviewResult } from "./types";
import type { ReviewFinding, ReviewWarning } from "./types";
import type { AIProvider, AIReviewResult } from "../ai/types";
import { ReviewEngine } from "../engine/review-engine";
import { ReactEngine } from "../react/engine";
import { nextjsPlugin, reactPlugin } from "../react";
import type { ReactPlugin } from "../react/engine";
import { parseSource } from "../analyzer/ast/parser";
import { prepareAIReviewDiff } from "../ai/input-policy";
import { evaluateSecurityReviewQualityGate } from "../analyzer/security/quality-gate";
import type { SecurityProfileId } from "../analyzer/security/policies";
import type { SecurityQualityGateSuppression } from "../analyzer/security/quality-gate";

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
  patch?: string;
  changedLines?: readonly number[];
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
  baseFiles?: ReviewFile[];
  securityQualityGate?: {
    readonly profile?: SecurityProfileId;
    readonly evaluatedAt: string;
    readonly baselineFindingIds?: readonly string[];
    readonly suppressions?: readonly SecurityQualityGateSuppression[];
  };
}

export async function reviewPullRequest(
  input: PRReviewInput,
  aiProvider?: AIProvider,
): Promise<ReviewResult> {
  const deterministicAnalysis = analyzeDeterministicFiles(input.files);
  const preparedAIInput = prepareAIReviewDiff(input.files);
  const warnings = [...deterministicAnalysis.warnings];
  if (aiProvider) {
    if (preparedAIInput.diff === undefined) {
      warnings.push({
        code: "AI_INPUT_OMITTED",
        message: "AI review was skipped because no changed-line patch was available.",
      });
    } else if (preparedAIInput.omittedFiles > 0) {
      warnings.push({
        code: "AI_INPUT_OMITTED",
        message: `AI review omitted ${preparedAIInput.omittedFiles} file(s) without changed-line patches.`,
      });
    }
    if (preparedAIInput.redactedValues > 0) {
      warnings.push({
        code: "AI_INPUT_REDACTED",
        message: `AI review input redacted ${preparedAIInput.redactedValues} sensitive value(s).`,
      });
    }
    if (preparedAIInput.truncated) {
      warnings.push({
        code: "AI_INPUT_TRUNCATED",
        message: "AI review input was truncated to stay within the configured data budget.",
      });
    }
  }

  const result = await new ReviewEngine().execute({
    deterministicFindings: deterministicAnalysis.findings,
    warnings,
    aiProvider,
    aiInput: aiProvider && preparedAIInput.diff
      ? {
          pullRequestTitle: input.title,
          pullRequestDescription: input.description,
          diff: preparedAIInput.diff,
          deterministicFindings: JSON.stringify(deterministicAnalysis.findings),
        }
      : undefined,
  });

  if (!input.securityQualityGate) return result;

  const securityQualityGate = evaluateSecurityReviewQualityGate({
    findings: result.findings,
    profile: input.securityQualityGate.profile ?? "security/banking",
    evaluatedAt: input.securityQualityGate.evaluatedAt,
    baselineFindingIds: [
      ...(input.securityQualityGate.baselineFindingIds ?? []),
      ...findUnchangedSecurityFindingIds(
        result.findings,
        input.files,
        input.baseFiles === undefined
          ? []
          : analyzeDeterministicFiles(input.baseFiles).findings,
      ),
    ],
    suppressions: input.securityQualityGate.suppressions,
  });
  const securityAnalyzerFailed = result.warnings.some(
    (warning) => warning.code === "SECURITY_RULE_FAILED",
  );
  const acceptedSecurityFindingIds = new Set(
    securityQualityGate.findings
      .filter((finding) => finding.state !== "new")
      .map((finding) => finding.findingId),
  );
  const policyDecision = aggregateReview(
    result.findings.filter((finding) => !acceptedSecurityFindingIds.has(finding.id)),
    result.durationMs,
    result.warnings,
  ).decision;

  return {
    ...result,
    decision: securityAnalyzerFailed || securityQualityGate.decision === "fail"
      ? "FAIL"
      : securityQualityGate.decision === "warn" && policyDecision === "PASS"
        ? "WARN"
        : policyDecision,
    securityQualityGate,
  };
}

function findUnchangedSecurityFindingIds(
  findings: readonly ReviewFinding[],
  files: readonly ReviewFile[],
  baseFindings: readonly ReviewFinding[],
): readonly string[] {
  const changedLinesByFile = new Map(
    files
      .filter((file) => file.changedLines !== undefined)
      .map((file) => [file.path, new Set(file.changedLines)]),
  );

  const baseFindingKeys = new Set(
    baseFindings
      .filter((finding) => finding.source === "security")
      .map(securityFindingKey),
  );

  return findings
    .filter((finding) => {
      if (finding.source !== "security" || finding.location?.line === undefined) return false;
      const changedLines = changedLinesByFile.get(finding.location.file);
      return changedLines !== undefined
        && !changedLines.has(finding.location.line)
        && baseFindingKeys.has(securityFindingKey(finding));
    })
    .map((finding) => finding.id);
}

function securityFindingKey(finding: ReviewFinding): string {
  return [
    finding.ruleId,
    finding.location?.file ?? "",
    finding.title,
    finding.message,
  ].join("\u0000");
}

function analyzeDeterministicFiles(
  files: readonly ReviewFile[],
): DeterministicAnalysis {
  const { parseableFiles, warnings } = getParseableFiles(files);

  const analyzerAnalysis = analyzeFilesWithWarnings(parseableFiles);
  const reactAnalyses = parseableFiles.map(({ path, content }) =>
    analyzeReactFile(path, content));

  return {
    findings: [
      ...analyzerAnalysis.findings,
      ...reactAnalyses.flatMap((analysis) => analysis.findings),
    ],
    warnings: [
      ...warnings,
      ...analyzerAnalysis.warnings,
      ...reactAnalyses.flatMap((analysis) => analysis.warnings),
    ],
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

function analyzeReactFile(
  path: string,
  content: string,
): { readonly findings: ReviewFinding[]; readonly warnings: ReviewWarning[] } {
  if (!/\.(tsx|jsx)$/.test(path)) {
    return { findings: [], warnings: [] };
  }

  return new ReactEngine().analyzeWithWarnings({
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
