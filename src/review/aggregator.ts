import type {
  ReviewFinding,
  ReviewResult,
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

    durationMs,
  };
}