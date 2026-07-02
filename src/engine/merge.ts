import type { ReviewFinding } from "../review/types";

export function mergeFindings(
  deterministicFindings: ReviewFinding[],
  aiFindings: ReviewFinding[],
): ReviewFinding[] {
  return [
    ...deterministicFindings,
    ...aiFindings,
  ];
}