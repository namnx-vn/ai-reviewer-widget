import type {
  ReviewFinding,
} from "../review/types";

export function mergeFindings(
  deterministic:
    ReviewFinding[],
  ai:
    ReviewFinding[],
): ReviewFinding[] {
  return [
    ...deterministic,
    ...ai,
  ];
}