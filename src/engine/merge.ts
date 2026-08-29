import type {
  ReviewFinding,
} from "../domain/review";

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