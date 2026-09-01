import { aggregateReview } from "../../domain/review";
import type { ReviewFinding, ReviewResult, ReviewWarning } from "../../domain/review";
import type {
  AIReviewerPort,
  ReviewApplicationDependencies,
  SecurityQualityGateRequest,
  SourceFile,
} from "./ports";
import type { ReviewConfiguration } from "./ports";
import { isPathIncluded } from "../../config";
import type { AnalyzerSelection } from "../../analyzer";

export interface PullRequestReviewInput {
  readonly title: string;
  readonly description?: string;
  readonly files: readonly SourceFile[];
  readonly baseFiles?: readonly SourceFile[];
  readonly securityQualityGate?: SecurityQualityGateRequest;
  readonly configuration?: ReviewConfiguration;
}

export interface ReviewUseCases {
  reviewFiles(files: readonly SourceFile[], configuration?: ReviewConfiguration): ReviewResult;
  reviewPullRequest(
    input: PullRequestReviewInput,
    aiReviewer?: AIReviewerPort,
  ): Promise<ReviewResult>;
}

export function createReviewUseCases(
  dependencies: ReviewApplicationDependencies,
): ReviewUseCases {
  return {
    reviewFiles(files, configuration = dependencies.configuration) {
      const startedAt = dependencies.now();
      const includedFiles = filterConfiguredFiles(files, configuration);
      const analysis = dependencies.deterministic.analyze(includedFiles, configuredSelection(configuration));
      return applyConfiguredSeverity(aggregateReview(
        [...analysis.findings],
        dependencies.now() - startedAt,
        [...analysis.warnings],
      ), configuration);
    },

    async reviewPullRequest(input, aiReviewer) {
      const configuration = input.configuration ?? dependencies.configuration;
      assertConfiguredAIProvider(configuration, aiReviewer);
      const includedFiles = filterConfiguredFiles(input.files, configuration);
      const analysis = dependencies.deterministic.analyze(includedFiles, configuredSelection(configuration));
      const aiEnabled = aiReviewer !== undefined && configuration?.ai.mode !== "disabled";
      const preparedAIInput = dependencies.prepareAIInput({
        title: input.title,
        description: input.description,
        deterministicFindings: JSON.stringify(analysis.findings),
        files: includedFiles,
      });
      const warnings = buildReviewWarnings(
        analysis.warnings,
        preparedAIInput,
        aiEnabled,
      );

      const result = await dependencies.pipeline.execute({
        deterministicFindings: [...analysis.findings],
        warnings,
        aiReviewer: aiEnabled ? aiReviewer : undefined,
        aiInput: aiEnabled && preparedAIInput.diff !== undefined
          ? {
              pullRequestTitle: preparedAIInput.title,
              pullRequestDescription: preparedAIInput.description,
              diff: preparedAIInput.diff,
              deterministicFindings: preparedAIInput.deterministicFindings,
            }
          : undefined,
      });
      const configuredResult = applyConfiguredSeverity(result, configuration);

      if (input.securityQualityGate === undefined) return configuredResult;

      return applyQualityGate(configuredResult, {
        ...input,
        files: includedFiles,
        baseFiles: filterConfiguredFiles(input.baseFiles ?? [], configuration),
        configuration,
      }, dependencies);
    },
  };
}

function assertConfiguredAIProvider(
  configuration: ReviewConfiguration | undefined,
  reviewer: AIReviewerPort | undefined,
): void {
  const provider = configuration?.ai.provider;
  if (configuration?.ai.mode === "enabled" && provider !== undefined && reviewer?.name !== provider) {
    throw new Error(`Configured AI provider "${provider}" is unavailable.`);
  }
}

function filterConfiguredFiles(
  files: readonly SourceFile[],
  configuration: ReviewConfiguration | undefined,
): readonly SourceFile[] {
  return configuration === undefined
    ? files
    : files.filter((file) => isPathIncluded(file.path, configuration));
}

function applyConfiguredSeverity(
  result: ReviewResult,
  configuration: ReviewConfiguration | undefined,
): ReviewResult {
  if (configuration === undefined || Object.keys(configuration.rules.severity).length === 0) {
    return result;
  }
  return {
    ...aggregateReview(
      result.findings.map((finding) => {
        const severity = configuration.rules.severity[finding.ruleId];
        return severity === undefined ? finding : { ...finding, severity };
      }),
      result.durationMs,
      result.warnings,
    ),
    securityQualityGate: result.securityQualityGate,
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
    : dependencies.deterministic.analyze(input.baseFiles, configuredSelection(input.configuration)).findings;
  const qualityGate = dependencies.evaluateQualityGate({
    findings: result.findings,
    profile: request.profile ?? input.configuration?.qualityGate.securityProfile ?? "security/banking",
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

function configuredSelection(
  configuration: ReviewConfiguration | undefined,
): AnalyzerSelection | undefined {
  if (configuration === undefined) return undefined;
  return {
    disabledContributionIds: configuration.rules.disabledFamilies.flatMap(familyContributions),
    disabledRuleIds: configuration.rules.disabled,
    severityOverrides: configuration.rules.severity,
  };
}

function familyContributions(
  family: ReviewConfiguration["rules"]["disabledFamilies"][number],
): readonly string[] {
  switch (family) {
    case "quality": return ["core.quality"];
    case "security": return ["core.security.ast", "core.security", "core.supply-chain"];
    case "performance": return ["core.performance"];
    case "architecture": return ["core.architecture"];
    case "mfe": return ["core.micro-frontend"];
    case "react": return ["core.react", "plugin.react"];
  }
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
