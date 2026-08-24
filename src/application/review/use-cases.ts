import { aggregateReview } from "../../domain/review";
import type { ReviewFinding, ReviewResult, ReviewWarning } from "../../domain/review";
import type {
  AIReviewerPort,
  ReviewApplicationDependencies,
  SecurityQualityGateRequest,
  SourceFile,
} from "./ports";

export interface PullRequestReviewInput {
  readonly title: string;
  readonly description?: string;
  readonly files: readonly SourceFile[];
  readonly baseFiles?: readonly SourceFile[];
  readonly securityQualityGate?: SecurityQualityGateRequest;
}

export interface ReviewUseCases {
  reviewFiles(files: readonly SourceFile[]): ReviewResult;
  reviewPullRequest(
    input: PullRequestReviewInput,
    aiReviewer?: AIReviewerPort,
  ): Promise<ReviewResult>;
}

export function createReviewUseCases(
  dependencies: ReviewApplicationDependencies,
): ReviewUseCases {
  return {
    reviewFiles(files) {
      const startedAt = dependencies.now();
      const analysis = dependencies.deterministic.analyze(files);
      return aggregateReview(
        [...analysis.findings],
        dependencies.now() - startedAt,
        [...analysis.warnings],
      );
    },

    async reviewPullRequest(input, aiReviewer) {
      const analysis = dependencies.deterministic.analyze(input.files);
      const preparedAIInput = dependencies.prepareAIInput({
        title: input.title,
        description: input.description,
        deterministicFindings: JSON.stringify(analysis.findings),
        files: input.files,
      });
      const warnings = buildReviewWarnings(
        analysis.warnings,
        preparedAIInput,
        aiReviewer !== undefined,
      );

      const result = await dependencies.pipeline.execute({
        deterministicFindings: [...analysis.findings],
        warnings,
        aiReviewer,
        aiInput: aiReviewer !== undefined && preparedAIInput.diff !== undefined
          ? {
              pullRequestTitle: preparedAIInput.title,
              pullRequestDescription: preparedAIInput.description,
              diff: preparedAIInput.diff,
              deterministicFindings: preparedAIInput.deterministicFindings,
            }
          : undefined,
      });

      if (input.securityQualityGate === undefined) return result;

      return applyQualityGate(result, input, dependencies);
    },
  };
}

function buildReviewWarnings(
  deterministicWarnings: readonly ReviewWarning[],
  prepared: ReturnType<ReviewApplicationDependencies["prepareAIInput"]>,
  aiEnabled: boolean,
): ReviewWarning[] {
  const warnings = [...deterministicWarnings];
  if (!aiEnabled) return warnings;

  if (prepared.diff === undefined) {
    warnings.push({
      code: "AI_INPUT_OMITTED",
      message: "AI review was skipped because no changed-line patch was available.",
    });
  } else if (prepared.omittedFiles > 0) {
    warnings.push({
      code: "AI_INPUT_OMITTED",
      message: `AI review omitted ${prepared.omittedFiles} file(s) without changed-line patches.`,
    });
  }
  if (prepared.redactedValues > 0) {
    warnings.push({
      code: "AI_INPUT_REDACTED",
      message: `AI review input redacted ${prepared.redactedValues} sensitive value(s).`,
    });
  }
  if (prepared.truncated) {
    warnings.push({
      code: "AI_INPUT_TRUNCATED",
      message: "AI review input was truncated to stay within the configured data budget.",
    });
  }
  return warnings;
}

function applyQualityGate(
  result: ReviewResult,
  input: PullRequestReviewInput,
  dependencies: ReviewApplicationDependencies,
): ReviewResult {
  const request = input.securityQualityGate;
  if (request === undefined) return result;

  const baseFindings = input.baseFiles === undefined
    ? []
    : dependencies.deterministic.analyze(input.baseFiles).findings;
  const qualityGate = dependencies.evaluateQualityGate({
    findings: result.findings,
    profile: request.profile ?? "security/banking",
    evaluatedAt: request.evaluatedAt,
    baselineFindingIds: [
      ...(request.baselineFindingIds ?? []),
      ...findUnchangedSecurityFindingIds(result.findings, input.files, baseFindings),
    ],
    suppressions: request.suppressions,
  });
  const acceptedIds = new Set(
    qualityGate.findings
      .filter((finding) => finding.state !== "new")
      .map((finding) => finding.findingId),
  );
  const policyDecision = aggregateReview(
    result.findings.filter((finding) => !acceptedIds.has(finding.id)),
    result.durationMs,
    result.warnings,
  ).decision;
  const securityAnalyzerFailed = result.warnings.some(
    (warning) => warning.code === "SECURITY_RULE_FAILED",
  );

  return {
    ...result,
    decision: securityAnalyzerFailed || qualityGate.decision === "fail"
      ? "FAIL"
      : qualityGate.decision === "warn" && policyDecision === "PASS"
        ? "WARN"
        : policyDecision,
    securityQualityGate: qualityGate,
  };
}

function findUnchangedSecurityFindingIds(
  findings: readonly ReviewFinding[],
  files: readonly SourceFile[],
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
