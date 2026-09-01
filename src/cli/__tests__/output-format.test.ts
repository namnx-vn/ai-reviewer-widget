import { describe, expect, it } from "vitest";

import type { ReviewResult } from "../../domain/review";
import { formatJsonReviewResult } from "../output-format";

describe("CLI JSON output", () => {
  it("emits a stable versioned schema derived from the review result", () => {
    const result: ReviewResult = {
      decision: "WARN",
      score: 85,
      findings: [{
        id: "finding-1",
        ruleId: "quality.no-console",
        title: "Console call",
        message: "Remove the console call.",
        severity: "high",
        source: "ast",
        location: { file: "src/example.ts", line: 2, column: 3 },
        suggestion: "Use the application logger.",
        confidence: 1,
      }],
      stats: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
      warnings: [],
      durationMs: 123,
    };

    expect(JSON.parse(formatJsonReviewResult(result))).toEqual({
      schemaVersion: 1,
      result: {
        decision: "WARN",
        score: 85,
        findings: result.findings,
        stats: result.stats,
        warnings: [],
      },
    });
    expect(formatJsonReviewResult(result).endsWith("\n")).toBe(true);
  });
});
