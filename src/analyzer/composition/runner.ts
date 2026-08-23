import type { ReviewFinding, ReviewWarning } from "../../domain/review";
import type { AnalyzerContributionResult, AnalyzerSourceFile } from "./contracts";
import type { AnalyzerContributionRegistry } from "./registry";

export function runAnalyzerContributions(
  files: readonly AnalyzerSourceFile[],
  registry: AnalyzerContributionRegistry,
): AnalyzerContributionResult {
  const findings: ReviewFinding[] = [];
  const warnings: ReviewWarning[] = [];

  for (const contribution of registry.snapshot()) {
    try {
      const analysis = contribution.analyze(files);
      findings.push(...analysis.findings);
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
