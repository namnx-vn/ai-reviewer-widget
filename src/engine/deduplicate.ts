import { ReviewFinding } from "../review/types";

export function deduplicateFindings(
  findings: ReviewFinding[],
) {
  const seen = new Set<string>();

  return findings.filter((finding) => {
    const key = [
      finding.location?.file,

      finding.location?.line,

      finding.ruleId,

      finding.title,
    ].join(":");

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });
}