import type {
  ReviewFinding,
  ReviewResult,
  ReviewWarning,
} from "./types";

import {
  calculateScore,
  calculateStats,
} from "./scorer";

import {
  buildDecision,
} from "../engine/decision";

export function aggregateReview(
  findings: ReviewFinding[],
  durationMs: number,
  warnings: ReviewWarning[] = [],
): ReviewResult {
  const score =
    calculateScore(findings);

  return {
    score,

    decision:
      buildDecision(score),

    findings,

    stats:
      calculateStats(findings),

    warnings,

    durationMs,
  };
}
