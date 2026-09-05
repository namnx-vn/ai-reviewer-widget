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
    expect(report.summary.cleanControlsWithFindings).toBeGreaterThanOrEqual(0);
    expect(report.summary.cleanControlsWithFindings).toBeLessThanOrEqual(10);
    expect(report.summary.cleanControlCaseFalsePositiveRate).toBeGreaterThanOrEqual(0);
    expect(report.summary.cleanControlCaseFalsePositiveRate).toBeLessThanOrEqual(1);
    expect(report.summary.cleanControlFindingCount).toBeGreaterThanOrEqual(0);
    expect(report.summary.cleanControlMediumOrHigherFindingCount).toBeGreaterThanOrEqual(0);
    expect(report.cases).toHaveLength(30);

    expect(() => JSON.parse(serializeRealWorldObservationReport(report))).not.toThrow();
  });
});
