import type { ReviewFinding, ReviewWarning } from "../../domain/review";
import type { IncrementalAnalysisScope, RuleExecutionScope } from "../incremental";
import type { RepositoryContext } from "../repository-context";
import type {
  AnalyzerContributionResult,
  AnalyzerSelection,
  AnalyzerSourceFile,
} from "./contracts";
import type { AnalyzerContributionRegistry } from "./registry";

export function runAnalyzerContributions(
  files: readonly AnalyzerSourceFile[],
  registry: AnalyzerContributionRegistry,
  selection: AnalyzerSelection = {
    disabledContributionIds: [],
    disabledRuleIds: [],
    severityOverrides: {},
  },
  repositoryContext?: RepositoryContext,
  incrementalScope?: IncrementalAnalysisScope,
): AnalyzerContributionResult {
  const findings: ReviewFinding[] = [];
  const warnings: ReviewWarning[] = [];
  const disabledContributions = new Set(selection.disabledContributionIds);
  const disabledRules = new Set(selection.disabledRuleIds);

  for (const contribution of registry.snapshot()) {
    if (disabledContributions.has(contribution.id) || disabledRules.has(contribution.id)) continue;
    try {
      const executionScope = contribution.executionScope ?? "repository";
      const scopedFiles = filesForScope(files, executionScope, incrementalScope);
      const analysis = contribution.analyze(scopedFiles, repositoryContext);
      findings.push(...analysis.findings
        .filter((finding) => !disabledRules.has(finding.ruleId))
        .filter((finding) => findingWithinScope(finding, executionScope, incrementalScope))
        .map((finding) => {
          const severity = selection.severityOverrides[finding.ruleId];
          return severity === undefined ? finding : { ...finding, severity };
        }));
      warnings.push(...analysis.warnings);
    } catch {
      warnings.push({
        code: "ANALYZER_CONTRIBUTION_FAILED",
        message: `Analyzer contribution "${contribution.id}" failed.`,
      });
    }
  }

  return { findings, warnings };
}

function filesForScope(
  files: readonly AnalyzerSourceFile[],
  scope: RuleExecutionScope,
  incrementalScope: IncrementalAnalysisScope | undefined,
): readonly AnalyzerSourceFile[] {
  if (incrementalScope === undefined || scope === "repository") return files;
  const paths = new Set(scope === "affected-module"
    ? incrementalScope.impactedFiles
    : incrementalScope.changedFiles);
  return files.filter((file) => paths.has(file.path));
}

function findingWithinScope(
  finding: ReviewFinding,
  scope: RuleExecutionScope,
  incrementalScope: IncrementalAnalysisScope | undefined,
): boolean {
  if (incrementalScope === undefined || scope !== "changed-range") return true;
  const file = finding.location?.file;
  const line = finding.location?.line;
  if (file === undefined || line === undefined) return true;
  const ranges = incrementalScope.changedRanges[file];
  if (ranges === undefined || ranges.length === 0) return true;
  return ranges.some(({ startLine, endLine }) => line >= startLine && line <= endLine);
}
