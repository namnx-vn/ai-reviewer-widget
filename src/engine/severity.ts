import type {
  ReviewFinding,
  Severity,
} from "../domain/review";

function downgrade(
  severity: Severity,
): Severity {
  switch (severity) {
    case "critical":
      return "high";

    case "high":
      return "medium";

    case "medium":
      return "low";

    case "low":
      return "info";

    case "info":
      return "info";
  }
}

export function adjustSeverity(
  findings: ReviewFinding[],
): ReviewFinding[] {
  return findings.map(
    (
      finding,
    ): ReviewFinding => {
      if (
        finding.source !== "ai"
      ) {
        return finding;
      }

      if (
        finding.confidence < 0.75
      ) {
        return {
          ...finding,

          severity:
            downgrade(
              finding.severity,
            ),
        };
      }

      return finding;
    },
  );
}