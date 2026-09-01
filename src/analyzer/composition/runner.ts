import type { ReviewFinding, ReviewWarning } from "../../domain/review";
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
): AnalyzerContributionResult {
  const findings: ReviewFinding[] = [];
  const warnings: ReviewWarning[] = [];
  const disabledContributions = new Set(selection.disabledContributionIds);
  const disabledRules = new Set(selection.disabledRuleIds);

  for (const contribution of registry.snapshot()) {
    if (disabledContributions.has(contribution.id) || disabledRules.has(contribution.id)) continue;
    try {
      const analysis = contribution.analyze(files);
      findings.push(...analysis.findings
        .filter((finding) => !disabledRules.has(finding.ruleId))
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
