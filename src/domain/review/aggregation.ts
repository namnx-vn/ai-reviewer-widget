import type { ReviewFinding, ReviewResult, ReviewWarning } from "./contracts";
import { buildDecision } from "./decision";
import { calculateScore, calculateStats } from "./scoring";

export function aggregateReview(
  findings: ReviewFinding[],
  durationMs: number,
  warnings: ReviewWarning[] = [],
): ReviewResult {
  const score = calculateScore(findings);

  return {
    score,
    decision: findings.some((finding) => finding.severity === "critical")
      ? "FAIL"
      : buildDecision(score),
    findings,
    stats: calculateStats(findings),
    warnings,
    durationMs,
  };
}
