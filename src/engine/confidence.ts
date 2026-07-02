import { ReviewFinding } from "../review/types";

export function applyConfidence(
  findings: ReviewFinding[],
) {
  return findings.map((finding) => ({
    ...finding,

    confidence:
      finding.confidence ??
      defaultConfidence(
        finding.source,
      ),
  }));
}

function defaultConfidence(
  source: ReviewFinding["source"],
) {
  switch (source) {
    case "ast":
      return 1;

    case "architecture":
      return 1;

    case "ai":
      return 0.75;
  }
}