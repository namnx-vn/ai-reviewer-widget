import type { ReviewFinding } from "../domain/review";
import type { EvaluationMetrics, FindingMatchResult } from "./contracts";

function ratio(numerator: number, denominator: number): number {
  if (denominator === 0) return 1;
  return numerator / denominator;
}

function duplicateKey(finding: ReviewFinding): string {
  return [
    finding.ruleId,
    finding.location?.file ?? "",
    finding.location?.line ?? "",
    finding.message,
  ].join(":");
}

export function calculateDuplicateRate(findings: readonly ReviewFinding[]): number {
  if (findings.length === 0) return 0;
  const unique = new Set(findings.map(duplicateKey)).size;
  return (findings.length - unique) / findings.length;
}

export function calculateStability(runs: readonly (readonly ReviewFinding[])[]): number {
  if (runs.length <= 1) return 1;
  const signatures = runs.map((findings) =>
    findings.map(duplicateKey).sort().join("\n"),
  );
  const baseline = signatures[0];
  const stableRuns = signatures.filter((signature) => signature === baseline).length;
  return stableRuns / signatures.length;
}

export function calculateEvaluationMetrics(
  matchResult: FindingMatchResult,
  actualFindings: readonly ReviewFinding[],
  runtimeMs: number,
  stability = 1,
): EvaluationMetrics {
  const matchedCount = matchResult.matches.length;
  const severityMatches = matchResult.matches.filter(
    ({ expected, actual }) => expected.severity === actual.severity,
  ).length;

  return {
    expectedCount: matchedCount + matchResult.falseNegatives.length,
    actualCount: actualFindings.length,
    matchedCount,
    precision: ratio(matchedCount, matchedCount + matchResult.falsePositives.length),
    recall: ratio(matchedCount, matchedCount + matchResult.falseNegatives.length),
    falsePositiveCount: matchResult.falsePositives.length,
    falseNegativeCount: matchResult.falseNegatives.length,
    severityAccuracy: ratio(severityMatches, matchedCount),
    duplicateRate: calculateDuplicateRate(actualFindings),
    stability,
    runtimeMs,
  };
}

export function summarizeMetrics(metrics: readonly EvaluationMetrics[]): EvaluationMetrics {
  const expectedCount = metrics.reduce((sum, value) => sum + value.expectedCount, 0);
  const actualCount = metrics.reduce((sum, value) => sum + value.actualCount, 0);
  const matchedCount = metrics.reduce((sum, value) => sum + value.matchedCount, 0);
  const falsePositiveCount = metrics.reduce((sum, value) => sum + value.falsePositiveCount, 0);
  const falseNegativeCount = metrics.reduce((sum, value) => sum + value.falseNegativeCount, 0);
  const runtimeMs = metrics.reduce((sum, value) => sum + value.runtimeMs, 0);

  return {
    expectedCount,
    actualCount,
    matchedCount,
    precision: ratio(matchedCount, matchedCount + falsePositiveCount),
    recall: ratio(matchedCount, matchedCount + falseNegativeCount),
    falsePositiveCount,
    falseNegativeCount,
    severityAccuracy: metrics.length === 0
      ? 1
      : metrics.reduce((sum, value) => sum + value.severityAccuracy, 0) / metrics.length,
    duplicateRate: metrics.length === 0
      ? 0
      : metrics.reduce((sum, value) => sum + value.duplicateRate, 0) / metrics.length,
    stability: metrics.length === 0
      ? 1
      : metrics.reduce((sum, value) => sum + value.stability, 0) / metrics.length,
    runtimeMs,
  };
}
