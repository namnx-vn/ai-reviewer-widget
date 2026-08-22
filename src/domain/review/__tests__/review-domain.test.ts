import { describe, expect, it } from "vitest";

import {
  aggregateReview,
  buildDecision,
  calculateScore,
  calculateStats,
  type ReviewFinding,
  type ReviewWarning,
} from "../index";

function finding(
  severity: ReviewFinding["severity"],
  confidence = 1,
): ReviewFinding {
  return {
    id: `${severity}-${confidence}`,
    ruleId: `test.${severity}`,
    title: `${severity} finding`,
    message: `A ${severity} issue was found.`,
    severity,
    source: "ast",
    confidence,
  };
}

describe("review domain", () => {
  it("calculates severity-weighted scores and clamps the result at zero", () => {
    expect(calculateScore([
      finding("critical", 0.5),
      finding("high"),
      finding("medium"),
      finding("low"),
      finding("info"),
    ])).toBe(59);

    expect(calculateScore([
      finding("critical"),
      finding("critical"),
      finding("critical"),
      finding("high"),
    ])).toBe(0);
  });

  it("counts every supported severity", () => {
    expect(calculateStats([
      finding("critical"),
      finding("high"),
      finding("medium"),
      finding("medium"),
      finding("low"),
      finding("info"),
    ])).toEqual({
      critical: 1,
      high: 1,
      medium: 2,
      low: 1,
      info: 1,
    });
  });

  it.each([
    [100, "PASS"],
    [90, "PASS"],
    [89, "WARN"],
    [70, "WARN"],
    [69, "FAIL"],
    [0, "FAIL"],
  ] as const)("maps a score of %s to %s", (score, expected) => {
    expect(buildDecision(score)).toBe(expected);
  });

  it("aggregates score, decision, stats, warnings, findings, and duration", () => {
    const findings = [finding("high"), finding("low", 0.5)];
    const warnings: ReviewWarning[] = [{
      code: "AI_REVIEW_FAILED",
      message: "The AI provider was unavailable.",
    }];

    expect(aggregateReview(findings, 42, warnings)).toEqual({
      score: 84,
      decision: "WARN",
      findings,
      stats: {
        critical: 0,
        high: 1,
        medium: 0,
        low: 1,
        info: 0,
      },
      warnings,
      durationMs: 42,
    });
  });

  it("fails on any critical finding and defaults warnings to an empty list", () => {
    const result = aggregateReview([finding("critical")], 1);

    expect(result.score).toBe(70);
    expect(result.decision).toBe("FAIL");
    expect(result.warnings).toEqual([]);
  });
});
