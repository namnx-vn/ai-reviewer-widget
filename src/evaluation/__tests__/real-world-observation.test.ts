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
    expect(report.summary.mustFindExpectations).toBe(32);
    expect(report.summary.mappedMustFindExpectations).toBe(17);
    expect(report.summary.mappedMustFindDetected).toBe(17);
    expect(report.summary.mappedMustFindRecall).toBe(1);
    expect(report.summary.mustFindExpectationsPendingRuleMapping).toBe(
      15,
    );
    expect(report.summary.recallTruePositiveCount).toBe(17);
    expect(report.summary.recallFalseNegativeCount).toBe(
      15,
    );
    expect(report.summary.adjudicatedRecall).toBe(
      17 / 32,
    );
    expect(report.summary.recallByCohort["baseline-50"]).toEqual({
      mustFindExpectations: 17,
      truePositiveCount: 17,
      falseNegativeCount: 0,
      recall: 1,
    });
    expect(report.summary.recallByCohort["expansion-wave-1"]).toEqual({
      mustFindExpectations: 15,
      truePositiveCount: 0,
      falseNegativeCount: 15,
      recall: 0,
    });

    expect(report.summary.precisionStatus).toBe("partially-adjudicated");
    expect(report.summary.adjudicatedFindingCount).toBe(29);
    expect(report.summary.truePositiveFindingCount).toBe(19);
    expect(report.summary.falsePositiveFindingCount).toBe(10);
    expect(report.summary.findingsPendingAdjudication).toBe(7);
    expect(report.summary.findingAdjudicationCoverage).toBe(29 / 36);
    expect(report.summary.precision).toBeNull();
    expect(report.summary.precisionByCohort["baseline-50"]).toEqual({
      totalFindings: 29,
      adjudicatedFindingCount: 29,
      truePositiveFindingCount: 19,
      falsePositiveFindingCount: 10,
      findingsPendingAdjudication: 0,
      adjudicationCoverage: 1,
      status: "measured",
      precision: 19 / 29,
    });
    expect(report.summary.precisionByCohort["expansion-wave-1"]).toEqual({
      totalFindings: 7,
      adjudicatedFindingCount: 0,
      truePositiveFindingCount: 0,
      falsePositiveFindingCount: 0,
      findingsPendingAdjudication: 7,
      adjudicationCoverage: 0,
      status: "pending-finding-adjudication",
      precision: null,
    });

    expect(report.summary.empiricalNegativeControls).toBe(15);
    expect(report.summary.empiricalNegativeControlCaseFalsePositiveRate).toBe(
      report.summary.empiricalNegativeControlsWithFindings
        / report.summary.empiricalNegativeControls,
    );
    expect(report.summary.empiricalNegativeControlFindingCount).toBeGreaterThanOrEqual(
      report.summary.empiricalNegativeControlsWithFindings,
    );
    expect(report.summary.empiricalNegativeControlMediumOrHigherFindingCount)
      .toBeLessThanOrEqual(report.summary.empiricalNegativeControlFindingCount);

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
