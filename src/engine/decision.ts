export type ReviewDecision =
  | "PASS"
  | "WARN"
  | "FAIL";

export function buildDecision(
  score: number,
): ReviewDecision {
  if (score >= 90) {
    return "PASS";
  }

  if (score >= 70) {
    return "WARN";
  }

  return "FAIL";
}