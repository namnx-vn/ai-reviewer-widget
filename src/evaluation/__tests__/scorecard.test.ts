import { describe, expect, it } from "vitest";
import { buildReliabilityScorecard } from "../scorecard";

const dimensions = { ruleId: "react.hooks", ruleFamily: "react", severity: "high", provenance: "deterministic", language: "typescript", framework: "react", profile: "app", repositoryCategory: "frontend", changeScope: "small-pr", findingScope: "changed-line", cohort: "development" };
const input = { datasetVersion: "truth-v1", reviewerVersion: "reviewer-v1", findings: [
  { id: "a", caseId: "case", repositoryId: "repo", dimensions, verdict: "true-positive" },
  { id: "b", caseId: "case", repositoryId: "repo", dimensions, verdict: "duplicate" },
  { id: "c", caseId: "case", repositoryId: "repo", dimensions, verdict: "pending" },
], expectations: [
  { id: "bug", caseId: "case", repositoryId: "repo", dimensions, detected: false },
], executions: [{ caseId: "case", success: true, fallback: false, stable: true, runtimeMs: 10, memoryBytes: null, aiRequests: null, aiCost: null }] };

describe("reliability scorecard", () => {
  it("reports denominators without counting pending or duplicate as true positive", () => {
    const report = buildReliabilityScorecard(input);
    expect(report.summary.precision).toEqual({ numerator: 1, denominator: 2, value: 0.5 });
    expect(report.summary.recall.value).toBe(0);
    expect(report.summary.pendingFindings).toBe(1);
    expect(report.summary.duplicateRate.value).toBe(0.5);
    expect(report.summary.adjudicationCoverage.value).toBeCloseTo(2 / 3);
    expect(report.operations.memoryBytes).toBeNull();
    expect(report.operations.successRate.value).toBe(1);
    expect(report.noiseRanking[0].key).toBe("react");
    expect(report.missRanking[0].metrics.falseNegatives).toBe(1);
    expect(report.dimensions.ruleId[0].key).toBe("react.hooks");
  });
  it("returns null for unavailable evidence and preserves invalid exclusions", () => {
    const report = buildReliabilityScorecard({ ...input, findings: [{ ...input.findings[0], verdict: "invalid-fixture" }], expectations: [{ ...input.expectations[0], detected: null }], executions: [] });
    expect(report.summary.precision.value).toBeNull();
    expect(report.summary.recall.value).toBeNull();
    expect(report.summary.excludedFindings).toBe(1);
    expect(report.summary.pendingExpectations).toBe(1);
    expect(report.operations.runtimeMs).toBeNull();
  });
  it("measures severity errors, nonactionability and negative-control violations independently", () => {
    const findings = ["true-positive", "false-positive", "not-actionable", "severity-too-high", "severity-too-low"].map((verdict, i) => ({ ...input.findings[0], id: `f-${i}`, verdict }));
    const report = buildReliabilityScorecard({ ...input, findings, expectations: [{ ...input.expectations[0], detected: true }], negativeControls: [{ ...input.expectations[0], id: "negative", violation: true }] });
    expect(report.summary.precision.value).toBe(3 / 5);
    expect(report.summary.severityAccuracy.value).toBe(1 / 3);
    expect(report.summary.falsePositiveRate.value).toBe(1);
    expect(report.summary.falseNegatives).toBe(0);
    expect(report.summary.f1).toBeCloseTo(0.75);
    expect(report.summary.noiseCount).toBe(3);
    expect(report.summary.precisionStatus).toBe("measured");
  });
  it("keeps invalid source expectations out of recall and handles zero F1", () => {
    const excluded = buildReliabilityScorecard({ ...input, findings: [], expectations: [{ ...input.expectations[0], qualityStatus: "invalid-fixture" }] });
    expect(excluded.summary.excludedExpectations).toBe(1);
    expect(excluded.summary.recall.value).toBeNull();
    const zero = buildReliabilityScorecard({ ...input, findings: [{ ...input.findings[0], verdict: "false-positive" }] });
    expect(zero.summary.f1).toBe(0);
  });
  it("reports operational measurement coverage and finite totals", () => {
    const report = buildReliabilityScorecard({ ...input, executions: [{ ...input.executions[0], success: false, fallback: true, stable: false, memoryBytes: 100, aiRequests: 2, aiCost: 0.5 }] });
    expect(report.operations.memoryBytes).toBe(100);
    expect(report.operations.aiRequests).toBe(2);
    expect(report.operations.aiCost).toBe(0.5);
    expect(report.operations.measurementCounts.memoryBytes).toBe(1);
    expect(report.operations.successRate.value).toBe(0);
    expect(report.operations.fallbackRate.value).toBe(1);
  });
  it("reports unknown stability and fallback measurements as missing denominators", () => {
    const report = buildReliabilityScorecard({ ...input, executions: [{ ...input.executions[0], stable: null, fallback: null }] });
    expect(report.operations.stability.value).toBeNull();
    expect(report.operations.fallbackRate.value).toBeNull();
  });
  it("rejects invalid optional arrays, ids, conflicting case repositories and measurements", () => {
    for (const bad of [{ ...input, negativeControls: "no" }, { ...input, findings: [{ ...input.findings[0], id: "" }] }, { ...input, expectations: [{ ...input.expectations[0], repositoryId: "other" }] }, { ...input, executions: [input.executions[0], input.executions[0]] }, { ...input, executions: [{ ...input.executions[0], success: "yes" }] }, { ...input, executions: [{ ...input.executions[0], aiRequests: 1.5 }] }, { ...input, expectations: [{ ...input.expectations[0], detected: "yes" }] }]) expect(() => buildReliabilityScorecard(bad)).toThrow();
  });
  it("rejects duplicate identities, invalid verdicts and unsupported enum dimensions", () => {
    for (const bad of [null, { ...input, findings: [...input.findings, input.findings[0]] }, { ...input, findings: [{ ...input.findings[0], verdict: "accepted" }] }, { ...input, findings: [{ ...input.findings[0], dimensions: { ...dimensions, severity: "urgent" } }] }, { ...input, executions: [{ ...input.executions[0], runtimeMs: Infinity }] }]) {
      expect(() => buildReliabilityScorecard(bad)).toThrow();
    }
  });
});
