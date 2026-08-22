import type { ReviewFinding, ReviewStats } from "./contracts";

const PENALTY: Record<ReviewFinding["severity"], number> = {
  critical: 30,
  high: 15,
  medium: 8,
  low: 3,
  info: 0,
};

export function calculateScore(findings: ReviewFinding[]): number {
  const penalty = findings.reduce(
    (total, finding) => total + PENALTY[finding.severity] * finding.confidence,
    0,
  );

  return Math.max(0, Math.round(100 - penalty));
}

export function calculateStats(findings: ReviewFinding[]): ReviewStats {
  return {
    critical: findings.filter((finding) => finding.severity === "critical").length,
    high: findings.filter((finding) => finding.severity === "high").length,
    medium: findings.filter((finding) => finding.severity === "medium").length,
    low: findings.filter((finding) => finding.severity === "low").length,
    info: findings.filter((finding) => finding.severity === "info").length,
  };
}
