import { describe, expect, it } from "vitest";

import { createDefaultReviewUseCases } from "../../application/review";
import {
  buildRealWorldObservationReport,
  REAL_WORLD_OBSERVATION_SCHEMA_VERSION,
  serializeRealWorldObservationReport,
} from "../real-world-observation";
import { loadRealWorldEvaluationCorpus } from "../real-world";

describe("real-world observation report", () => {
  it("reports empirical clean-control pressure without inventing recall mappings", () => {
    const report = buildRealWorldObservationReport(
      createDefaultReviewUseCases(),
      loadRealWorldEvaluationCorpus(),
    );

    expect(report.schemaVersion).toBe(REAL_WORLD_OBSERVATION_SCHEMA_VERSION);
    expect(report.summary.totalCases).toBe(30);
    expect(report.summary.stableCases).toBe(30);
    expect(report.summary.mustFindExpectations).toBe(11);
    expect(report.summary.mustFindExpectationsPendingRuleMapping).toBe(11);
    expect(report.summary.precisionStatus).toBe("pending-rule-mapping");
    expect(report.summary.cleanControls).toBe(10);
    expect(report.summary.syntheticCleanControls).toBe(7);
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
    expect(report.cases).toHaveLength(30);

    expect(() => JSON.parse(serializeRealWorldObservationReport(report))).not.toThrow();
  }, 15_000);
});
