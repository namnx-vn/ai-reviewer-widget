import type {
  ReviewFinding,
  ReviewResult,
} from "./types";

import {
  calculateScore,
  calculateStats,
} from "./scorer";

export function aggregateReview(
  findings: ReviewFinding[],
  durationMs: number,
): ReviewResult {
  return {
    score: calculateScore(findings),
    findings,
    stats: calculateStats(findings),
    durationMs,
  };
}