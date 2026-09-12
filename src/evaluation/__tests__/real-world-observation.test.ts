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
    expect(report.summary.totalCases).toBe(75);
    expect(report.summary.stableCases).toBe(75);
    expect(report.summary.mustFindExpectations).toBeGreaterThan(17);
    expect(report.summary.mappedMustFindExpectations).toBe(17);
    expect(report.summary.mappedMustFindDetected).toBe(17);
    expect(report.summary.mappedMustFindRecall).toBe(1);
    expect(report.summary.mustFindExpectationsPendingRuleMapping).toBe(
      report.summary.mustFindExpectations - 17,
    );
    expect(report.summary.recallTruePositiveCount).toBe(17);
    expect(report.summary.recallFalseNegativeCount).toBe(
      report.summary.mustFindExpectations - 17,
    );
    expect(report.summary.adjudicatedRecall).toBe(
      17 / report.summary.mustFindExpectations,
    );
    expect(report.summary.recallByCohort["baseline-50"]).toEqual({
      mustFindExpectations: 17,
      truePositiveCount: 17,
      falseNegativeCount: 0,
      recall: 1,
    });
    expect(report.summary.recallByCohort["expansion-wave-1"]?.mustFindExpectations)
      .toBeGreaterThan(0);

    expect(report.summary.precisionStatus).toBe("partially-adjudicated");
    expect(report.summary.adjudicatedFindingCount).toBe(17);
    expect(report.summary.truePositiveFindingCount).toBe(17);
    expect(report.summary.falsePositiveFindingCount).toBe(0);
    expect(report.summary.findingsPendingAdjudication).toBe(
      report.summary.totalFindings - 17,
    );
    expect(report.summary.precision).toBeNull();

    expect(report.summary.empiricalNegativeControls).toBeGreaterThanOrEqual(15);
    expect(report.summary.empiricalNegativeControlsWithFindings).toBe(0);
    expect(report.summary.empiricalNegativeControlCaseFalsePositiveRate).toBe(0);
    expect(report.summary.empiricalNegativeControlFindingCount).toBe(0);
    expect(report.summary.empiricalNegativeControlMediumOrHigherFindingCount).toBe(0);

    expect(report.summary.cleanControls).toBeGreaterThanOrEqual(14);
    expect(report.summary.empiricalCleanControlsWithFindings).toBe(0);
    expect(report.summary.empiricalCleanControlCaseFalsePositiveRate).toBe(0);
    expect(report.summary.empiricalCleanControlFindingCount).toBe(0);
    expect(report.summary.empiricalCleanControlMediumOrHigherFindingCount).toBe(0);
    expect(report.summary.allCleanControlsWithFindings).toBe(0);
    expect(report.summary.allCleanControlFindingCount).toBe(0);
    expect(report.cases).toHaveLength(75);

    expect(() => JSON.parse(serializeRealWorldObservationReport(report))).not.toThrow();
  }, 25_000);
});
