import { describe, expect, it } from "vitest";
import type { ReviewFinding } from "../../domain/review";
import { calculateDuplicateRate, calculateEvaluationMetrics, calculateStability } from "../metrics";

const finding = (id: string, severity: ReviewFinding["severity"] = "high"): ReviewFinding => ({
  id,
  ruleId: "security/demo",
  title: "Demo",
  message: "demo finding",
  severity,
  source: "security",
  confidence: 1,
  location: { file: "src/demo.ts", line: 4 },
});

describe("evaluation metrics", () => {
  it("calculates precision, recall, severity accuracy, and explicit misses", () => {
    const actual = [finding("actual-1", "high"), finding("actual-2", "medium")];
    const metrics = calculateEvaluationMetrics({
      matches: [{
        expected: { id: "expected-1", ruleId: "security/demo", severity: "high" },
        actual: actual[0],
      }],
      falsePositives: [actual[1]],
      falseNegatives: [{ id: "expected-2", ruleId: "security/missing", severity: "medium" }],
    }, actual, 12, 0.5);

    expect(metrics.precision).toBe(0.5);
    expect(metrics.recall).toBe(0.5);
    expect(metrics.severityAccuracy).toBe(1);
    expect(metrics.falsePositiveCount).toBe(1);
    expect(metrics.falseNegativeCount).toBe(1);
    expect(metrics.runtimeMs).toBe(12);
    expect(metrics.stability).toBe(0.5);
  });

  it("detects duplicates and deterministic repeated runs", () => {
    const duplicate = finding("actual-2");
    expect(calculateDuplicateRate([finding("actual-1"), duplicate])).toBe(0.5);
    expect(calculateStability([[finding("one")], [finding("two")]])).toBe(1);
    expect(calculateStability([[finding("one")], []])).toBe(0.5);
  });
});
