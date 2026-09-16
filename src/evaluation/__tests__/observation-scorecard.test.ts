import { describe, expect, it } from "vitest";
import { createDefaultReviewUseCases } from "../../application/review";
import { loadRealWorldEvaluationCorpus } from "../real-world";
import { buildRealWorldObservationReport } from "../real-world-observation";
import { buildObservationScorecard } from "../observation-scorecard";

describe("adjudicated observation scorecard integration", () => {
  it("retains quarantined captures and genuine unmapped misses without fabricating operational measurements", () => {
    const cases = loadRealWorldEvaluationCorpus().filter((c) => c.evaluationCase.id.includes("96245") || c.evaluationCase.id.includes("96727"));
    const observation = buildRealWorldObservationReport(createDefaultReviewUseCases(), cases);
    const result = buildObservationScorecard(observation, "dataset-v6", "reviewer-v7");
    expect(result.scorecard.summary.excludedFindings).toBe(2);
    expect(result.scorecard.summary.excludedExpectations).toBe(1);
    expect(result.scorecard.summary.falseNegatives).toBe(1);
    expect(result.scorecard.summary.falsePositives).toBe(1);
    expect(result.scorecard.operations.memoryBytes).toBeNull();
    expect(result.scorecard.operations.runtimeMs).toBeNull();
    expect(result.promotionEligibility).toBe("insufficient-evidence");
  });
});
