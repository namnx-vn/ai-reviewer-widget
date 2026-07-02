import type { ReviewFinding } from "../review/types";

export function adjustSeverity(
  findings: ReviewFinding[],
): ReviewFinding[] {
  return findings.map((finding): ReviewFinding => {
    if (
      finding.source !== "ai"
    ) {
      return finding;
    }

    if (
      finding.severity === "critical" &&
      (finding.confidence ?? 1) < 0.5
    ) {
      return {
        ...finding,
        severity: "medium",
      };
    }

    return finding;
  });
}