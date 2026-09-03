import type { ReviewFinding } from "../domain/review";
import type { ExpectedFinding, FindingMatchResult } from "./contracts";

function matchesExpected(actual: ReviewFinding, expected: ExpectedFinding): boolean {
  if (actual.ruleId !== expected.ruleId) return false;
  if (expected.file !== undefined && actual.location?.file !== expected.file) return false;
  if (expected.line !== undefined && actual.location?.line !== expected.line) return false;
  return true;
}

export function matchFindings(
  expectedFindings: readonly ExpectedFinding[],
  actualFindings: readonly ReviewFinding[],
): FindingMatchResult {
  const unmatchedActual = new Set(actualFindings.map((_, index) => index));
  const matches: FindingMatchResult["matches"][number][] = [];
  const falseNegatives: ExpectedFinding[] = [];

  for (const expected of expectedFindings) {
    const actualIndex = actualFindings.findIndex(
      (actual, index) => unmatchedActual.has(index) && matchesExpected(actual, expected),
    );

    if (actualIndex === -1) {
      falseNegatives.push(expected);
      continue;
    }

    unmatchedActual.delete(actualIndex);
    matches.push({ expected, actual: actualFindings[actualIndex] });
  }

  return {
    matches,
    falsePositives: actualFindings.filter((_, index) => unmatchedActual.has(index)),
    falseNegatives,
  };
}
