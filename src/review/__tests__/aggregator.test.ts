import { describe, expect, it } from "vitest";

import { aggregateReview } from "../aggregator";
import type { ReviewFinding } from "../types";

describe("review aggregation decision", () => {
  it("fails a review containing a critical finding even when the score is in the warning range", () => {
    const criticalFinding: ReviewFinding = {
      id: "security-critical-1",
      ruleId: "security.injection.sql",
      title: "SQL injection",
      message: "Untrusted input reaches a SQL query.",
      severity: "critical",
      source: "security",
      confidence: 1,
    };

    const result = aggregateReview([criticalFinding], 1);

    expect(result.score).toBe(70);
    expect(result.decision).toBe("FAIL");
  });
});
