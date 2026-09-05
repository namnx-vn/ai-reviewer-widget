import { describe, expect, it } from "vitest";

import { createDefaultReviewUseCases } from "../../application/review";
import {
  buildRealWorldObservationReport,
  REAL_WORLD_OBSERVATION_SCHEMA_VERSION,
  serializeRealWorldObservationReport,
} from "../real-world-observation";
import { loadRealWorldEvaluationCorpus } from "../real-world";

describe("real-world observation report", () => {
  it("reports empirical negative-control pressure without inventing recall mappings", () => {
    const report = buildRealWorldObservationReport(
      createDefaultReviewUseCases(),
      loadRealWorldEvaluationCorpus(),
    );

    expect(report.schemaVersion).toBe(REAL_WORLD_OBSERVATION_SCHEMA_VERSION);
    expect(report.summary.totalCases).toBe(50);
    expect(report.summary.stableCases).toBe(50);
    expect(report.summary.mustFindExpectations).toBe(17);
    expect(report.summary.mustFindExpectationsPendingRuleMapping).toBe(17);
    expect(report.summary.precisionStatus).toBe("pending-rule-mapping");

    expect(report.summary.empiricalNegativeControls).toBe(5);
    expect(report.summary.empiricalNegativeControlsWithFindings).toBeGreaterThanOrEqual(0);
    expect(report.summary.empiricalNegativeControlsWithFindings).toBeLessThanOrEqual(5);
    expect(report.summary.empiricalNegativeControlCaseFalsePositiveRate).toBeGreaterThanOrEqual(0);
    expect(report.summary.empiricalNegativeControlCaseFalsePositiveRate).toBeLessThanOrEqual(1);
    expect(report.summary.empiricalNegativeControlFindingCount).toBeGreaterThanOrEqual(0);
    expect(report.summary.empiricalNegativeControlMediumOrHigherFindingCount).toBeGreaterThanOrEqual(0);

    expect(report.summary.cleanControls).toBe(14);
    expect(report.summary.syntheticCleanControls).toBe(11);
    expect(report.summary.empiricalCleanControls).toBe(3);
    expect(report.summary.empiricalCleanControlsWithFindings).toBeGreaterThanOrEqual(0);
    expect(report.summary.empiricalCleanControlsWithFindings).toBeLessThanOrEqual(3);
    expect(report.summary.empiricalCleanControlCaseFalsePositiveRate).toBeGreaterThanOrEqual(0);
    expect(report.summary.empiricalCleanControlCaseFalsePositiveRate).toBeLessThanOrEqual(1);
    expect(report.summary.empiricalCleanControlFindingCount).toBeGreaterThanOrEqual(0);
    expect(report.summary.empiricalCleanControlMediumOrHigherFindingCount).toBeGreaterThanOrEqual(0);
    expect(report.summary.allCleanControlsWithFindings).toBeGreaterThanOrEqual(
      report.summary.empiricalCleanControlsWithFindings,
    );
    expect(report.summary.allCleanControlFindingCount).toBeGreaterThanOrEqual(
      report.summary.empiricalCleanControlFindingCount,
    );
    expect(report.cases).toHaveLength(50);

    expect(() => JSON.parse(serializeRealWorldObservationReport(report))).not.toThrow();
  }, 25_000);
});
