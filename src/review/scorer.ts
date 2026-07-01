import type {
  ReviewFinding,
  ReviewStats,
} from "./types";

const penalty = {
  critical: 30,
  high: 15,
  medium: 8,
  low: 3,
  info: 0,
} as const;

export function calculateScore(
  findings: ReviewFinding[],
): number {
  const deduction = findings.reduce(
    (total, finding) =>
      total + penalty[finding.severity],
    0,
  );

  return Math.max(0, 100 - deduction);
}

export function calculateStats(
  findings: ReviewFinding[],
): ReviewStats {
  return {
    critical: findings.filter(
      (f) => f.severity === "critical",
    ).length,

    high: findings.filter(
      (f) => f.severity === "high",
    ).length,

    medium: findings.filter(
      (f) => f.severity === "medium",
    ).length,

    low: findings.filter(
      (f) => f.severity === "low",
    ).length,

    info: findings.filter(
      (f) => f.severity === "info",
    ).length,
  };
}