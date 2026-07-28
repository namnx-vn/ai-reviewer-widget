import { describe, expect, it } from "vitest";

import { formatReviewComment } from "../formatter";
import type { ReviewResult } from "../types";

function makeResult(score: number): ReviewResult {
  return {
    score,
    decision: "PASS",
    findings: [],
    stats: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    warnings: [],
    durationMs: 0,
  };
}

describe("formatReviewComment", () => {
  it.each([
    [95, "🟢 Excellent"],
    [80, "🟡 Good"],
    [60, "🟠 Needs improvement"],
    [20, "🔴 Changes requested"],
  ])("uses the correct status for score %i", (score, status) => {
    const comment = formatReviewComment(makeResult(score));

    expect(comment).toContain(status);
    expect(comment).toContain(`Review Score: ${score}/100`);
  });
});
