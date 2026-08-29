import type {
  ReviewFinding,
} from "../domain/review";

export function applyConfidence(
  findings: ReviewFinding[],
): ReviewFinding[] {
  return findings.map(
    (finding): ReviewFinding => ({
      ...finding,

      confidence:
        finding.source === "ast" ||
        finding.source ===
          "architecture"
          ? 1
          : Math.min(
              1,
              Math.max(
                0,
                finding.confidence,
              ),
            ),
    }),
  );
}