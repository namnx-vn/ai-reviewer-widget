import { describe, expect, it } from "vitest";

import { createDefaultReviewUseCases } from "../../application/review";
import {
  buildRealWorldObservationReport,
  REAL_WORLD_OBSERVATION_SCHEMA_VERSION,
  serializeRealWorldObservationReport,
} from "../real-world-observation";
import { loadRealWorldEvaluationCorpus } from "../real-world";

describe("real-world observation report", () => {
  it("reports mapped recall and empirical negative-control pressure without inventing mappings", () => {
    const report = buildRealWorldObservationReport(
      createDefaultReviewUseCases(),
      loadRealWorldEvaluationCorpus(),
    );

    expect(report.schemaVersion).toBe(REAL_WORLD_OBSERVATION_SCHEMA_VERSION);
    expect(report.summary.totalCases).toBe(50);
    expect(report.summary.stableCases).toBe(50);
    expect(report.summary.mustFindExpectations).toBe(17);
    expect(report.summary.mappedMustFindExpectations).toBe(1);
    expect(report.summary.mappedMustFindDetected).toBe(1);
    expect(report.summary.mappedMustFindRecall).toBe(1);
    expect(report.summary.mustFindExpectationsPendingRuleMapping).toBe(16);
    expect(report.summary.precisionStatus).toBe("pending-rule-mapping");

    expect(report.summary.empiricalNegativeControls).toBe(5);
    expect(report.summary.empiricalNegativeControlsWithFindings).toBe(0);
    expect(report.summary.empiricalNegativeControlCaseFalsePositiveRate).toBe(0);
    expect(report.summary.empiricalNegativeControlFindingCount).toBe(0);
    expect(report.summary.empiricalNegativeControlMediumOrHigherFindingCount).toBe(0);

    expect(report.summary.cleanControls).toBe(14);
    expect(report.summary.syntheticCleanControls).toBe(11);
    expect(report.summary.empiricalCleanControls).toBe(3);
    expect(report.summary.empiricalCleanControlsWithFindings).toBe(0);
    expect(report.summary.empiricalCleanControlCaseFalsePositiveRate).toBe(0);
    expect(report.summary.empiricalCleanControlFindingCount).toBe(0);
    expect(report.summary.empiricalCleanControlMediumOrHigherFindingCount).toBe(0);
    expect(report.summary.allCleanControlsWithFindings).toBe(0);
    expect(report.summary.allCleanControlFindingCount).toBe(0);
    expect(report.cases).toHaveLength(50);

    expect(() => JSON.parse(serializeRealWorldObservationReport(report))).not.toThrow();
  }, 25_000);
});
