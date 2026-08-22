import { describe, expect, it } from "vitest";

import { buildDecision as legacyBuildDecision } from "../../../engine/decision";
import { aggregateReview as legacyAggregateReview } from "../../../review/aggregator";
import {
  calculateScore as legacyCalculateScore,
  calculateStats as legacyCalculateStats,
} from "../../../review/scorer";
import {
  aggregateReview,
  buildDecision,
  calculateScore,
  calculateStats,
  type ReviewResult,
} from "../index";
import type { ReviewResult as LegacyReviewResult } from "../../../review/types";

describe("legacy review domain compatibility", () => {
  it("re-exports the domain policies from the established module paths", () => {
    expect(legacyAggregateReview).toBe(aggregateReview);
    expect(legacyBuildDecision).toBe(buildDecision);
    expect(legacyCalculateScore).toBe(calculateScore);
    expect(legacyCalculateStats).toBe(calculateStats);
  });

  it("keeps the established result type compatible with the domain contract", () => {
    const domainResult: ReviewResult = aggregateReview([], 0);
    const legacyResult: LegacyReviewResult = domainResult;

    expect(legacyResult).toEqual(domainResult);
  });
});
