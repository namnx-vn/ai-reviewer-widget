import type {
  ReviewFinding,
  ReviewStats,
} from "./types";

const PENALTY: Record<
  ReviewFinding["severity"],
  number
> = {
  critical: 30,
  high: 15,
  medium: 8,
  low: 3,
  info: 0,
};

export function calculateScore(
  findings: ReviewFinding[],
): number {
  const penalty =
    findings.reduce(
      (
        total,
        finding,
      ) =>
        total +
        PENALTY[
          finding.severity
        ] *
          finding.confidence,
      0,
    );

  return Math.max(
    0,
    Math.round(100 - penalty),
  );
}

export function calculateStats(
  findings: ReviewFinding[],
): ReviewStats {
  return {
    critical: findings.filter(
      (f) =>
        f.severity ===
        "critical",
    ).length,

    high: findings.filter(
      (f) =>
        f.severity === "high",
    ).length,

    medium: findings.filter(
      (f) =>
        f.severity === "medium",
    ).length,

    low: findings.filter(
      (f) =>
        f.severity === "low",
    ).length,

    info: findings.filter(
      (f) =>
        f.severity === "info",
    ).length,
  };
}