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
      13,
    );
    expect(report.summary.adjudicatedRecall).toBe(
      17 / 30,
    );
    expect(report.summary.recallByCohort["baseline-50"]).toEqual({
      mustFindExpectations: 17,
      truePositiveCount: 17,
      falseNegativeCount: 0,
      recall: 1,
    });
    expect(report.summary.recallByCohort["expansion-wave-1"]).toEqual({
      mustFindExpectations: 13,
      truePositiveCount: 0,
      falseNegativeCount: 13,
      recall: 0,
    });

    expect(report.summary.qualityStatus).toBe("blocked-invalid-fixtures");
    expect(report.summary.excludedCaseIds).toEqual([
      "vercel-next-96245-hmr-digest-serialization",
      "vercel-next-97184-app-loader-cache-hit-dependency",
    ]);
    expect(report.summary.excludedFindingCount).toBe(6);
    expect(report.summary.eligibleFindingCount).toBe(30);
    expect(report.summary.eligiblePrecision).toBe(19 / 30);
    expect(report.summary.excludedMustFindExpectations).toBe(2);
    expect(report.summary.rawCorpusRecall).toBe(17 / 32);
    expect(report.summary.precisionStatus).toBe("blocked-invalid-fixtures");
    expect(report.summary.adjudicatedFindingCount).toBe(36);
    expect(report.summary.truePositiveFindingCount).toBe(19);
    expect(report.summary.falsePositiveFindingCount).toBe(11);
    expect(report.summary.findingsPendingAdjudication).toBe(0);
    expect(report.summary.findingAdjudicationCoverage).toBe(1);
    expect(report.summary.precision).toBeNull();
    expect(report.summary.precisionByCohort["baseline-50"]).toEqual({
      totalFindings: 29,
      adjudicatedFindingCount: 29,
      truePositiveFindingCount: 19,
      falsePositiveFindingCount: 10,
      findingsPendingAdjudication: 0,
      adjudicationCoverage: 1,
      excludedFindingCount: 0,
      eligibleFindingCount: 29,
      eligiblePrecision: 19 / 29,
      status: "measured",
      precision: 19 / 29,
    });
    expect(report.summary.precisionByCohort["expansion-wave-1"]).toEqual({
      totalFindings: 7,
      adjudicatedFindingCount: 7,
      truePositiveFindingCount: 0,
      falsePositiveFindingCount: 1,
      findingsPendingAdjudication: 0,
      adjudicationCoverage: 1,
      excludedFindingCount: 6,
      eligibleFindingCount: 1,
      eligiblePrecision: 0,
      status: "blocked-invalid-fixtures",
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

  it("keeps invalid source minimizations quarantined even if a detector stops emitting", () => {
    const useCases = createDefaultReviewUseCases();
    const invalidCases = loadRealWorldEvaluationCorpus().filter(
      ({ evaluationCase }) => evaluationCase.id === "vercel-next-96245-hmr-digest-serialization",
    );
    const report = buildRealWorldObservationReport({
      ...useCases,
      reviewFiles(files, configuration, incrementalScope) {
        return { ...useCases.reviewFiles(files, configuration, incrementalScope), findings: [] };
      },
    }, invalidCases);

    expect(report.summary.qualityStatus).toBe("blocked-invalid-fixtures");
    expect(report.summary.precision).toBeNull();
    expect(report.summary.eligiblePrecision).toBeNull();
    expect(report.summary.adjudicatedRecall).toBeNull();
    expect(report.summary.rawCorpusRecall).toBe(0);
    expect(report.summary.excludedMustFindExpectations).toBe(1);
  });
});
